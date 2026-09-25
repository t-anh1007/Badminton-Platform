import { shouldRequeue } from '@khoaluantn/eventbus';
import type { Channel, ConsumeMessage } from 'amqplib';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { connectRabbitMQ } from '@khoaluantn/eventbus';
import { applyRatedResultInTransaction, applyRatingCorrection } from '../domain/passport.js';
import { prisma } from './prisma.js';

const QUEUE_NAME = 'matchmaking.rating-periods';
const EVENT_TYPE = 'RatingPeriodReady';

const ratingPeriodSchema = z.object({
  matchId: z.string().uuid(),
  userId: z.string().uuid(),
  // Event cũ chưa có loại hình là rating singles (BR-CM-44).
  discipline: z.enum(['singles', 'doubles']).default('singles'),
  results: z.array(z.object({
    opponentRating: z.number().finite(),
    opponentRd: z.number().positive().finite(),
    score: z.number().min(0).max(1),
  }).strict()).min(1),
}).strict();

const RATING_CORRECTION = 'RatingCorrectionApproved';
const ratingCorrectionSchema = z.object({
  ticketId: z.string().uuid(),
  userId: z.string().uuid(),
  discipline: z.enum(['singles', 'doubles']),
  approvedTier: z.enum(['newcomer', 'beginner', 'intermediate', 'intermediate_plus', 'advanced']),
  adminUserId: z.string().uuid(),
}).strict();

/** Idempotent theo ticketId (unique audit), nên replay/gửi lại không áp dụng hai lần. */
export async function handleRatingCorrectionApproved(payload: z.input<typeof ratingCorrectionSchema>): Promise<void> {
  await applyRatingCorrection(ratingCorrectionSchema.parse(payload));
}

export type RatingPeriodReadyPayload = z.input<typeof ratingPeriodSchema>;

export async function handleRatingPeriodReady(
  eventId: string,
  payload: RatingPeriodReadyPayload,
): Promise<void> {
  const input = ratingPeriodSchema.parse(payload);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${eventId}, 0))`;
    const alreadyProcessed = await tx.processedEvent.findUnique({ where: { eventId } });
    if (alreadyProcessed) return;

    await applyRatedResultInTransaction(tx, input);
    await tx.processedEvent.create({ data: { eventId } });
  });
}

function eventIdOf(message: ConsumeMessage, type = EVENT_TYPE): string {
  if (message.properties.messageId) return `${type}:${message.properties.messageId}`;
  return `${type}:${createHash('sha256').update(message.content).digest('hex')}`;
}

async function consumeMessage(channel: Channel, message: ConsumeMessage | null): Promise<void> {
  if (!message) return;
  try {
    const raw = JSON.parse(message.content.toString()) as { type?: unknown };
    if (raw.type === RATING_CORRECTION) {
      const envelope = z.object({ type: z.literal(RATING_CORRECTION), payload: ratingCorrectionSchema }).passthrough().parse(raw);
      await handleRatingCorrectionApproved(envelope.payload);
    } else {
      const envelope = z.object({ type: z.literal(EVENT_TYPE), payload: ratingPeriodSchema }).passthrough().parse(raw);
      await handleRatingPeriodReady(eventIdOf(message), envelope.payload);
    }
    channel.ack(message);
  } catch (error) {
    console.error('[matchmaking-service rating consumer]', error);
    // Requeue vô điều kiện là bẫy poison message: event không bao giờ xử lý
    // được sẽ quay lại ngay, đốt CPU consumer + broker + DB vô hạn. Thử lại
    // đúng một lần rồi bỏ.
    channel.nack(message, false, shouldRequeue(error, message));
  }
}

export async function bootstrapRatingEventConsumption(): Promise<() => Promise<void>> {
  const { connection, channel } = await connectRabbitMQ(
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  );
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.bindQueue(QUEUE_NAME, 'domain-events', EVENT_TYPE);
  await channel.bindQueue(QUEUE_NAME, 'domain-events', RATING_CORRECTION);
  await channel.consume(QUEUE_NAME, (message) => void consumeMessage(channel, message));

  return async () => {
    await channel.close();
    await connection.close();
  };
}
