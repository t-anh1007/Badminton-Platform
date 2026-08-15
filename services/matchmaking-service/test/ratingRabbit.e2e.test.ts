import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { connectRabbitMQ, publishEvent } from '@khoaluantn/eventbus';
import { prisma } from '../src/lib/prisma.js';
import { bootstrapRatingEventConsumption } from '../src/lib/ratingEventConsumer.js';

const runRabbitE2E = process.env.RUN_P2_RABBIT_E2E === '1';
const describeRabbit = runRabbitE2E ? describe : describe.skip;
const createdUsers: string[] = [];
const processedEventIds: string[] = [];
let stopConsumer: (() => Promise<void>) | undefined;
let publisher: Awaited<ReturnType<typeof connectRabbitMQ>> | undefined;

async function waitUntilProcessed(eventId: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await prisma.processedEvent.findUnique({ where: { eventId } })) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${eventId}`);
}

afterAll(async () => {
  await stopConsumer?.();
  if (publisher) {
    await publisher.channel.close();
    await publisher.connection.close();
  }
  await prisma.processedEvent.deleteMany({ where: { eventId: { in: processedEventIds } } });
  await prisma.passport.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.$disconnect();
});

describeRabbit('F-01 — RabbitMQ runtime path', () => {
  it('consumes RatingPeriodReady and deduplicates a broker replay', async () => {
    const userId = randomUUID();
    const messageId = randomUUID();
    const processedEventId = `RatingPeriodReady:${messageId}`;
    createdUsers.push(userId);
    processedEventIds.push(processedEventId);
    await prisma.passport.create({
      data: {
        userId,
        declaredTier: 'intermediate',
        ratingMu: 1500,
        ratingRd: 350,
        ratingSigma: 0.06,
      },
    });
    stopConsumer = await bootstrapRatingEventConsumption();
    publisher = await connectRabbitMQ(process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672');
    const payload = {
      matchId: randomUUID(),
      userId,
      results: [{ opponentRating: 1800, opponentRd: 100, score: 1 }],
    };

    publishEvent(publisher.channel, 'RatingPeriodReady', payload, { messageId });
    await waitUntilProcessed(processedEventId);
    const afterFirst = await prisma.passport.findUniqueOrThrow({ where: { userId } });

    publishEvent(publisher.channel, 'RatingPeriodReady', payload, { messageId });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const afterReplay = await prisma.passport.findUniqueOrThrow({ where: { userId } });

    expect(afterFirst.ratingMu).toBeGreaterThan(1500);
    expect(afterFirst.matchesPlayed).toBe(1);
    expect(afterReplay).toEqual(afterFirst);
  });
});
