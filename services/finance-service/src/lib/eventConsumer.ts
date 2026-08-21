import type { Channel, ConsumeMessage } from 'amqplib';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { connectRabbitMQ, shouldRequeue } from '@khoaluantn/eventbus';
import { env } from './env.js';
import { prisma } from './prisma.js';
import { handleUserRegistered, handleProviderApproved } from '../domain/walletProvisioning.js';
import { recordBookingRevenue } from '../domain/revenue.js';
import { creditLatePayment } from '../domain/latePayment.js';
import { refundCancelledBooking, type BookingCancelledPayload } from '../domain/refund.js';
import type {
  JoinApprovedPayload,
  MatchCancelledPayload,
  MatchConfirmedPayload,
  MatchCreatedPayload,
  MatchFeeRefundRequestedPayload,
  MatchBookingResolutionPayload,
  MatchSettlementRequestedPayload,
} from '@khoaluantn/shared';
import {
  handleJoinApproved,
  handleMatchCancelled,
  handleMatchConfirmed,
  handleMatchCreated,
  handleMatchFeeRefundRequested,
  handleMatchBookingResolved,
  handleMatchSettlementRequested,
  handleMatchSettlementTooLate,
} from '../domain/matchFee.js';
import type { MatchSettlementTooLatePayload } from '@khoaluantn/shared';

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

type EventConsumerHooks = {
  beforeMatchBookingResolved?: (payload: MatchBookingResolutionPayload) => Promise<void> | void;
};

function isLegacyMatchConfirmed(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    && (!('attemptId' in payload) || !('venueRevision' in payload));
}

export async function quarantineLegacyMatchConfirmed(eventId: string, payload: Record<string, unknown>): Promise<void> {
  await prisma.quarantinedEvent.upsert({
    where: { eventId },
    update: {},
    create: {
      eventId,
      eventType: 'MatchConfirmed',
      payload: payload as Prisma.InputJsonValue,
      reason: 'Legacy MatchConfirmed is missing required attemptId or venueRevision fencing fields.',
    },
  });
}

/** Cất event không xử lý được vào bảng quarantine trước khi bỏ, để không mất
 * dữ liệu tiền bạc — có thể dựng lại thủ công sau khi điều tra. Tự nuốt lỗi ghi
 * DB: quarantine hỏng thì vẫn phải nack cho xong, không được để message treo
 * giữ channel. */
async function quarantineFailedEvent(eventId: string, raw: string, reason: string): Promise<void> {
  try {
    let eventType = 'Unknown';
    let payload: unknown = { raw };
    try {
      const parsed = JSON.parse(raw) as { type?: unknown; payload?: unknown };
      if (typeof parsed.type === 'string') eventType = parsed.type;
      if (parsed.payload !== undefined) payload = parsed.payload;
    } catch {
      // Payload không parse được thì giữ nguyên raw để điều tra.
    }
    await prisma.quarantinedEvent.upsert({
      where: { eventId },
      update: {},
      create: { eventId, eventType, payload: payload as Prisma.InputJsonValue, reason },
    });
    // eslint-disable-next-line no-console
    console.error(`[finance-service] đã quarantine event ${eventId} (${eventType})`);
  } catch (quarantineError) {
    // eslint-disable-next-line no-console
    console.error('[finance-service] không quarantine được event', eventId, quarantineError);
  }
}

async function onMessage(channel: Channel, msg: ConsumeMessage | null, hooks?: EventConsumerHooks): Promise<void> {
  if (!msg) return;
  try {
    const envelope = JSON.parse(msg.content.toString()) as { type: string; payload: unknown };
    const eventId = eventIdOf(msg);
    if (envelope.type === 'UserRegistered') {
      await handleUserRegistered(eventId, envelope.payload as { userId: string; email: string });
    } else if (envelope.type === 'ProviderApproved') {
      await handleProviderApproved(eventId, envelope.payload as { providerId: string; userId: string });
    } else if (envelope.type === 'BookingConfirmed') {
      await recordBookingRevenue(eventId, envelope.payload as {
        bookingId: string; businessUserId: string; gross: string;
        venueId: string; endAt: string; source: 'marketplace' | 'internal';
      });
    } else if (envelope.type === 'PaymentTooLate') {
      await creditLatePayment(eventId, envelope.payload as { bookingId: string; userId: string | null; amount: string });
    } else if (envelope.type === 'BookingCancelled') {
      await handleBookingCancelled(eventId, envelope.payload);
    } else if (envelope.type === 'MatchCreated') {
      await handleMatchCreated(eventId, envelope.payload as MatchCreatedPayload);
    } else if (envelope.type === 'JoinApproved') {
      await handleJoinApproved(eventId, envelope.payload as JoinApprovedPayload);
    } else if (envelope.type === 'MatchConfirmed') {
      if (isLegacyMatchConfirmed(envelope.payload)) {
        await quarantineLegacyMatchConfirmed(eventId, envelope.payload);
        channel.ack(msg);
        return;
      }
      await handleMatchConfirmed(eventId, envelope.payload as MatchConfirmedPayload);
    } else if (envelope.type === 'MatchCancelled') {
      await handleMatchCancelled(eventId, envelope.payload as MatchCancelledPayload);
    } else if (envelope.type === 'MatchFeeRefundRequested') {
      await handleMatchFeeRefundRequested(eventId, envelope.payload as MatchFeeRefundRequestedPayload);
    } else if (envelope.type === 'MatchSettlementTooLate') {
      await handleMatchSettlementTooLate(eventId, envelope.payload as MatchSettlementTooLatePayload);
    } else if (envelope.type === 'MatchBookingResolved') {
      await hooks?.beforeMatchBookingResolved?.(envelope.payload as MatchBookingResolutionPayload);
      await handleMatchBookingResolved(eventId, envelope.payload as MatchBookingResolutionPayload);
    } else if (envelope.type === 'MatchSettlementRequested') {
      await handleMatchSettlementRequested(eventId, envelope.payload as MatchSettlementRequestedPayload);
    }
    channel.ack(msg);
  } catch (err) {
    // Requeue vô điều kiện từng khiến service quay ~100 event/giây khi gặp một
    // event không bao giờ xử lý được. Thử lại đúng một lần, sau đó cất vào
    // quarantine rồi bỏ — không mất dữ liệu, không quay vòng.
    const requeue = shouldRequeue(err, msg);
    // eslint-disable-next-line no-console
    console.error(`[finance-service] lỗi xử lý event (requeue=${requeue}):`, err);
    if (!requeue) {
      await quarantineFailedEvent(eventIdOf(msg), msg.content.toString(), String(err));
    }
    channel.nack(msg, false, requeue);
  }
}

/** Kết nối RabbitMQ, bind queue riêng vào UserRegistered + BookingConfirmed + PaymentTooLate. */
export async function bootstrapEventConsumption(options?: {
  queueName?: string;
  deleteQueueOnStop?: boolean;
  beforeMatchBookingResolved?: (payload: MatchBookingResolutionPayload) => Promise<void> | void;
}): Promise<() => Promise<void>> {
  const { connection, channel } = await connectRabbitMQ(env.rabbitmqUrl);
  const queueName = options?.queueName ?? QUEUE_NAME;
  await channel.assertQueue(queueName, { durable: !options?.deleteQueueOnStop, autoDelete: Boolean(options?.deleteQueueOnStop) });
  for (const eventType of [
    'UserRegistered', 'ProviderApproved', 'BookingConfirmed', 'PaymentTooLate',
    'BookingCancelled', 'MatchCreated', 'JoinApproved', 'MatchConfirmed',
    'MatchCancelled', 'MatchFeeRefundRequested', 'MatchSettlementTooLate', 'MatchBookingResolved',
    'MatchSettlementRequested',
  ]) await channel.bindQueue(queueName, 'domain-events', eventType);
  const inFlight = new Set<Promise<void>>();
  const { consumerTag } = await channel.consume(queueName, (msg) => {
    const task = onMessage(channel, msg, { beforeMatchBookingResolved: options?.beforeMatchBookingResolved });
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  });

  return async () => {
    // Stop new deliveries first, then let ack/nack for current messages finish
    // before closing the channel. This keeps test/runtime shutdown from calling
    // nack on an already closed channel.
    await channel.cancel(consumerTag);
    await Promise.allSettled([...inFlight]);
    if (options?.deleteQueueOnStop) await channel.deleteQueue(queueName);
    await channel.close();
    await connection.close();
  };
}
