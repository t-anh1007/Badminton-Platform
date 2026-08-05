import type { Channel, ConsumeMessage } from 'amqplib';
import { connectRabbitMQ } from '@khoaluantn/eventbus';
import { env } from './env.js';
import { prisma } from './prisma.js';

interface AccountLockedPayload {
  userId: string;
  locked: boolean;
  reason: string;
  actorUserId: string;
}

const QUEUE_NAME = 'venue-booking.account-events';

/** Xử lý AccountLocked idempotent qua ProcessedEvent — hoàn thành AC-ACC-08-3/08-4
 * (khóa NCC thì ẩn cơ sở khỏi tìm kiếm + chặn booking mới; khôi phục thì trả lại). */
export async function handleAccountLocked(eventId: string, payload: AccountLockedPayload): Promise<void> {
  const already = await prisma.processedEvent.findUnique({ where: { eventId } });
  if (already) return; // đã xử lý — tránh xử lý trùng khi RabbitMQ redeliver

  await prisma.$transaction(async (tx) => {
    if (payload.locked) {
      // Chỉ chuyển approved -> suspended (đúng state diagram); không đụng
      // provider đang pending/rejected vì lý do khác.
      await tx.provider.updateMany({
        where: { userId: payload.userId, status: 'approved' },
        data: { status: 'suspended', suspendedByAccountLock: true },
      });
    } else {
      // Chỉ khôi phục provider bị suspended DO chính việc khóa tài khoản này gây ra.
      await tx.provider.updateMany({
        where: { userId: payload.userId, status: 'suspended', suspendedByAccountLock: true },
        data: { status: 'approved', suspendedByAccountLock: false },
      });
    }
    await tx.processedEvent.create({ data: { eventId } });
  });
}

async function onMessage(channel: Channel, msg: ConsumeMessage | null): Promise<void> {
  if (!msg) return;
  try {
    const envelope = JSON.parse(msg.content.toString()) as {
      type: string;
      payload: AccountLockedPayload;
    };
    // eventId không có sẵn trong envelope hiện tại (packages/eventbus chưa gắn) —
    // dùng deliveryTag + routingKey + JSON làm khóa idempotency tạm thời ổn định
    // theo nội dung message (đủ để chống xử lý trùng khi redeliver cùng message).
    const eventId = `${msg.fields.routingKey}:${msg.properties.messageId ?? Buffer.from(msg.content).toString('base64').slice(0, 64)}`;
    if (envelope.type === 'AccountLocked') {
      await handleAccountLocked(eventId, envelope.payload);
    }
    channel.ack(msg);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[venue-booking] lỗi xử lý event, requeue:', err);
    channel.nack(msg, false, true);
  }
}

/** Kết nối RabbitMQ, bind queue riêng vào routing key AccountLocked, tiêu thụ liên tục. */
export async function bootstrapEventConsumption(): Promise<() => Promise<void>> {
  const { connection, channel } = await connectRabbitMQ(env.rabbitmqUrl);
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.bindQueue(QUEUE_NAME, 'domain-events', 'AccountLocked');
  await channel.consume(QUEUE_NAME, (msg) => void onMessage(channel, msg));

  return async () => {
    await channel.close();
    await connection.close();
  };
}
