import type { Channel, ConsumeMessage } from 'amqplib';
import { createHash } from 'node:crypto';
import { connectRabbitMQ } from '@khoaluantn/eventbus';
import { env } from './env.js';
import { prisma } from './prisma.js';
import { writeOutbox } from './outbox.js';
import type { MatchCancelledPayload } from '@khoaluantn/shared';
import { releaseHeldMatchBooking } from '../domain/booking.js';
import type { MatchSettlementTooLatePayload } from '@khoaluantn/shared';

interface AccountLockedPayload {
  userId: string;
  locked: boolean;
  reason: string;
  actorUserId: string;
}

interface PaymentCompletedPayload {
  bookingId: string;
  refType?: 'matchFee' | 'matchSettlement';
  matchId?: string;
}

const QUEUE_NAME = 'venue-booking.domain-events';

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

/** BOK-07 bước 3-6 — Consumer `PaymentCompleted` (AC-BOK-07-1, 2, 4). Còn
 * trong hạn hold -> `confirmed` + phát `BookingConfirmed` để finance ghi
 * doanh thu (FIN-09). Đã hết hạn -> `cancelled`, KHÔNG phục hồi, và phát
 * `PaymentTooLate` để finance ghi có ví cá nhân (FIN-06/BR-BOK-04) — venue-
 * booking-service không có quyền ghi ví, chỉ có thể báo lại qua sự kiện. */
export async function handlePaymentCompleted(eventId: string, payload: PaymentCompletedPayload): Promise<void> {
  const already = await prisma.processedEvent.findUnique({ where: { eventId } });
  if (already) return; // AC-BOK-07-4: phát lại không sinh BookingConfirmed lần hai

  const booking = await prisma.booking.findUnique({
    where: { id: payload.bookingId },
    include: { court: { include: { venue: { include: { provider: true } } } } },
  });
  if (!booking) {
    // Không có gì để xử lý — vẫn đánh dấu đã xử lý để không kẹt requeue vô hạn.
    await prisma.processedEvent.create({ data: { eventId } });
    return;
  }

  const stillPayable = booking.status === 'held' && !!booking.holdExpiresAt && booking.holdExpiresAt.getTime() > Date.now();

  await prisma.$transaction(async (tx) => {
    if (stillPayable) {
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'confirmed' } });
      // BOK-07 bước 5: xóa hold Ở BƯỚC XÁC NHẬN (không phải lúc tạo booking).
      // Khớp chính xác slot của booking + userId để không xóa nhầm hold slot
      // khác mà người chơi có thể đã giữ sau đó (một hold/người). Booking
      // confirmed thì EXCLUDE trên bảng bookings tiếp quản việc chặn slot.
      if (booking.userId) {
        await tx.hold.deleteMany({
          where: { courtId: booking.courtId, userId: booking.userId, startAt: booking.startAt, endAt: booking.endAt },
        });
      }
      await writeOutbox(tx, {
        aggregateType: 'Booking',
        aggregateId: booking.id,
        eventType: 'BookingConfirmed',
        payload: {
          bookingId: booking.id,
          businessUserId: booking.court.venue.provider.userId,
          gross: booking.priceSnapshot.toString(),
          venueId: booking.court.venue.id,
          endAt: booking.endAt.toISOString(),
          source: booking.source,
        },
      });
    } else {
      // BR-BOK-04: hết hạn thì KHÔNG phục hồi — chỉ đảm bảo trạng thái là
      // cancelled (có thể đã được tác vụ nền chuyển từ trước) rồi báo finance.
      if (booking.status === 'held') {
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'cancelled' } });
      }
      const matchSettlement = payload.refType === 'matchSettlement' && payload.matchId;
      await writeOutbox(tx, {
        aggregateType: 'Booking',
        aggregateId: booking.id,
        eventType: matchSettlement ? 'MatchSettlementTooLate' : 'PaymentTooLate',
        payload: matchSettlement
          ? ({ matchId: payload.matchId!, bookingId: booking.id } satisfies MatchSettlementTooLatePayload)
          : {
            bookingId: booking.id,
            userId: booking.userId,
            amount: booking.priceSnapshot.toString(),
          },
      });
    }
    await tx.processedEvent.create({ data: { eventId } });
  });
}

function eventIdOf(msg: ConsumeMessage): string {
  // eventId không có sẵn trong envelope hiện tại (packages/eventbus chưa gắn) —
  // dùng messageId nếu có, hoặc SHA-256 của TOÀN BỘ nội dung message làm khóa
  // idempotency ổn định theo nội dung.
  //
  // BUG tự phát hiện ở G4 (kiểm thử tích hợp thật qua RabbitMQ lần đầu tiên
  // trong dự án — G1-G3 chỉ gọi thẳng hàm consumer, chưa bao giờ đi qua hàng
  // đợi thật nên không lộ ra): bản cũ cắt 64 KÝ TỰ ĐẦU của base64(nội dung).
  // Với envelope `{"type":"...","occurredAt":"<ISO>","payload":{...}}`, riêng
  // phần "type"+"occurredAt" đã chiếm hết 64 ký tự đó với hầu hết tên sự
  // kiện — nghĩa là `payload` KHÔNG BAO GIỜ lọt vào hash. Hai sự kiện CÙNG
  // loại phát trong cùng một giây (rất thường xảy ra) sinh ra CÙNG eventId,
  // khiến sự kiện thứ hai bị coi là "đã xử lý" và bị bỏ qua — mất dữ liệu
  // thật (ví dụ: booking thứ hai không bao giờ được xác nhận). Sửa bằng
  // cách băm SHA-256 toàn bộ nội dung thay vì cắt một đoạn đầu cố định.
  if (msg.properties.messageId) return `${msg.fields.routingKey}:${msg.properties.messageId}`;
  const hash = createHash('sha256').update(msg.content).digest('hex');
  return `${msg.fields.routingKey}:${hash}`;
}

async function onMessage(channel: Channel, msg: ConsumeMessage | null): Promise<void> {
  if (!msg) return;
  try {
    const envelope = JSON.parse(msg.content.toString()) as { type: string; payload: unknown };
    const eventId = eventIdOf(msg);
    if (envelope.type === 'AccountLocked') {
      await handleAccountLocked(eventId, envelope.payload as AccountLockedPayload);
    } else if (envelope.type === 'PaymentCompleted') {
      const payload = envelope.payload as PaymentCompletedPayload;
      // Participant/organizer match-fee receipts share the historical event
      // name but must never confirm the court booking. Only the final combined
      // settlement publishes booking-only PaymentCompleted.
      // D39: match settlement is confirmed only by resolveMatchBooking's
      // fenced, venue-owned command. A late/redelivered financial event must
      // never run the generic held -> confirmed path after a revoke won.
      if (!payload.refType) await handlePaymentCompleted(eventId, payload);
    } else if (envelope.type === 'MatchCancelled') {
      await releaseHeldMatchBooking(eventId, envelope.payload as MatchCancelledPayload);
    }
    channel.ack(msg);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[venue-booking] lỗi xử lý event, requeue:', err);
    channel.nack(msg, false, true);
  }
}

/** Kết nối RabbitMQ, bind queue riêng vào các routing key liên quan, tiêu thụ liên tục. */
export async function bootstrapEventConsumption(options?: {
  queueName?: string;
  deleteQueueOnStop?: boolean;
}): Promise<() => Promise<void>> {
  const { connection, channel } = await connectRabbitMQ(env.rabbitmqUrl);
  const queueName = options?.queueName ?? QUEUE_NAME;
  await channel.assertQueue(queueName, { durable: !options?.deleteQueueOnStop, autoDelete: Boolean(options?.deleteQueueOnStop) });
  await channel.bindQueue(queueName, 'domain-events', 'AccountLocked');
  await channel.bindQueue(queueName, 'domain-events', 'PaymentCompleted');
  await channel.bindQueue(queueName, 'domain-events', 'MatchCancelled');
  const inFlight = new Set<Promise<void>>();
  const { consumerTag } = await channel.consume(queueName, (msg) => {
    const task = onMessage(channel, msg);
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  });

  return async () => {
    await channel.cancel(consumerTag);
    await Promise.allSettled([...inFlight]);
    if (options?.deleteQueueOnStop) await channel.deleteQueue(queueName);
    await channel.close();
    await connection.close();
  };
}
