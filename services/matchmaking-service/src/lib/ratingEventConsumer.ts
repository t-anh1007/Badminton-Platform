import { shouldRequeue } from '@khoaluantn/eventbus';
import type { Channel, ConsumeMessage } from 'amqplib';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { connectRabbitMQ } from '@khoaluantn/eventbus';
import { applyRatingPeriodInTransaction } from '../domain/passport.js';
import { prisma } from './prisma.js';

const QUEUE_NAME = 'matchmaking.rating-periods';
const EVENT_TYPE = 'RatingPeriodReady';

const ratingPeriodSchema = z.object({
  matchId: z.string().uuid(),
  userId: z.string().uuid(),
  results: z.array(z.object({
    opponentRating: z.number().finite(),
    opponentRd: z.number().positive().finite(),
    score: z.number().min(0).max(1),
  }).strict()).min(1),
}).strict();

export type RatingPeriodReadyPayload = z.infer<typeof ratingPeriodSchema>;

export async function handleRatingPeriodReady(
  eventId: string,
  payload: RatingPeriodReadyPayload,
): Promise<void> {
  const input = ratingPeriodSchema.parse(payload);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${eventId}, 0))`;
    const alreadyProcessed = await tx.processedEvent.findUnique({ where: { eventId } });
    if (alreadyProcessed) return;

    await applyRatingPeriodInTransaction(tx, input.userId, input.results, 1);
    await tx.processedEvent.create({ data: { eventId } });
  });
}

function eventIdOf(message: ConsumeMessage): string {
  if (message.properties.messageId) return `${EVENT_TYPE}:${message.properties.messageId}`;
  return `${EVENT_TYPE}:${createHash('sha256').update(message.content).digest('hex')}`;
}

async function consumeMessage(channel: Channel, message: ConsumeMessage | null): Promise<void> {
  if (!message) return;
  try {
    const envelope = z.object({
      type: z.literal(EVENT_TYPE),
      payload: ratingPeriodSchema,
    }).passthrough().parse(JSON.parse(message.content.toString()));
    await handleRatingPeriodReady(eventIdOf(message), envelope.payload);
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
  await channel.consume(QUEUE_NAME, (message) => void consumeMessage(channel, message));

  return async () => {
    await channel.close();
    await connection.close();
  };
}
