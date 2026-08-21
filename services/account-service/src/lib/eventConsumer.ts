import type { Channel, ConsumeMessage } from 'amqplib';
import { createHash } from 'node:crypto';
import { connectRabbitMQ, shouldRequeue } from '@khoaluantn/eventbus';
import { env } from './env.js';
import { grantProviderRole } from '../domain/providerRole.js';

const QUEUE_NAME = 'account.domain-events';

function eventIdOf(msg: ConsumeMessage): string {
  // Ưu tiên messageId (= Outbox.id, ổn định qua replay — xem eventbus
  // publishEvent); fallback SHA-256 toàn nội dung. Xem giải thích lỗi replay ở
  // decision-log D22.
  if (msg.properties.messageId) return `${msg.fields.routingKey}:${msg.properties.messageId}`;
  const hash = createHash('sha256').update(msg.content).digest('hex');
  return `${msg.fields.routingKey}:${hash}`;
}

async function onMessage(channel: Channel, msg: ConsumeMessage | null): Promise<void> {
  if (!msg) return;
  try {
    const envelope = JSON.parse(msg.content.toString()) as { type: string; payload: unknown };
    const eventId = eventIdOf(msg);
    if (envelope.type === 'ProviderApproved') {
      await grantProviderRole(eventId, envelope.payload as { providerId: string; userId: string });
    }
    channel.ack(msg);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[account-service] lỗi xử lý event, requeue:', err);
    // Requeue vô điều kiện là bẫy poison message: event không bao giờ xử lý
    // được sẽ quay lại ngay, đốt CPU consumer + broker + DB vô hạn. Thử lại
    // đúng một lần rồi bỏ.
    channel.nack(msg, false, shouldRequeue(err, msg));
  }
}

/** D25 — Consumer đầu tiên của account-service: nhận ProviderApproved để cộng
 * vai `provider` cho tài khoản (VEN-02 duyệt NCC). */
export async function bootstrapEventConsumption(): Promise<() => Promise<void>> {
  const { connection, channel } = await connectRabbitMQ(env.rabbitmqUrl);
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.bindQueue(QUEUE_NAME, 'domain-events', 'ProviderApproved');
  await channel.consume(QUEUE_NAME, (msg) => void onMessage(channel, msg));

  return async () => {
    await channel.close();
    await connection.close();
  };
}
