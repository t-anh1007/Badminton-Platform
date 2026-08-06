import type { Channel, ConsumeMessage } from 'amqplib';
import { createHash } from 'node:crypto';
import { connectRabbitMQ } from '@khoaluantn/eventbus';
import { env } from './env.js';
import { handleUserRegistered, handleProviderApproved } from '../domain/walletProvisioning.js';
import { recordBookingRevenue } from '../domain/revenue.js';
import { creditLatePayment } from '../domain/latePayment.js';
import { refundCancelledBooking, type BookingCancelledPayload } from '../domain/refund.js';

const QUEUE_NAME = 'finance.domain-events';

/** G5 FIN-07/08 — public entrypoint shared by RabbitMQ and integration tests. */
export async function handleBookingCancelled(eventId: string, payload: unknown): Promise<void> {
  await refundCancelledBooking(eventId, payload);
}

function eventIdOf(msg: ConsumeMessage): string {
  // BUG tự phát hiện ở G4 — xem giải thích đầy đủ ở
  // venue-booking-service/src/lib/eventConsumer.ts: cắt 64 ký tự đầu của
  // base64(nội dung) khiến `payload` không bao giờ lọt vào hash, hai sự kiện
  // CÙNG loại phát trong cùng giây bị coi là trùng và bị bỏ qua sai. Sửa
  // bằng SHA-256 toàn bộ nội dung.
  if (msg.properties.messageId) return `${msg.fields.routingKey}:${msg.properties.messageId}`;
  const hash = createHash('sha256').update(msg.content).digest('hex');
  return `${msg.fields.routingKey}:${hash}`;
}

async function onMessage(channel: Channel, msg: ConsumeMessage | null): Promise<void> {
  if (!msg) return;
  try {
    const envelope = JSON.parse(msg.content.toString()) as { type: string; payload: unknown };
    const eventId = eventIdOf(msg);
    if (envelope.type === 'UserRegistered') {
      await handleUserRegistered(eventId, envelope.payload as { userId: string; email: string });
    } else if (envelope.type === 'ProviderApproved') {
      await handleProviderApproved(eventId, envelope.payload as { providerId: string; userId: string });
    } else if (envelope.type === 'BookingConfirmed') {
      await recordBookingRevenue(eventId, envelope.payload as { bookingId: string; businessUserId: string; gross: string });
    } else if (envelope.type === 'PaymentTooLate') {
      await creditLatePayment(eventId, envelope.payload as { bookingId: string; userId: string | null; amount: string });
    } else if (envelope.type === 'BookingCancelled') {
      await handleBookingCancelled(eventId, envelope.payload);
    }
    channel.ack(msg);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[finance-service] lỗi xử lý event, requeue:', err);
    channel.nack(msg, false, true);
  }
}

/** Kết nối RabbitMQ, bind queue riêng vào UserRegistered + BookingConfirmed + PaymentTooLate. */
export async function bootstrapEventConsumption(): Promise<() => Promise<void>> {
  const { connection, channel } = await connectRabbitMQ(env.rabbitmqUrl);
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.bindQueue(QUEUE_NAME, 'domain-events', 'UserRegistered');
  await channel.bindQueue(QUEUE_NAME, 'domain-events', 'ProviderApproved');
  await channel.bindQueue(QUEUE_NAME, 'domain-events', 'BookingConfirmed');
  await channel.bindQueue(QUEUE_NAME, 'domain-events', 'PaymentTooLate');
  await channel.bindQueue(QUEUE_NAME, 'domain-events', 'BookingCancelled');
  const inFlight = new Set<Promise<void>>();
  const { consumerTag } = await channel.consume(QUEUE_NAME, (msg) => {
    const task = onMessage(channel, msg);
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  });

  return async () => {
    // Stop new deliveries first, then let ack/nack for current messages finish
    // before closing the channel. This keeps test/runtime shutdown from calling
    // nack on an already closed channel.
    await channel.cancel(consumerTag);
    await Promise.allSettled([...inFlight]);
    await channel.close();
    await connection.close();
  };
}
