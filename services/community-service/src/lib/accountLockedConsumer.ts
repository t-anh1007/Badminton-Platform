import { shouldRequeue } from '@khoaluantn/eventbus';
import { createHash } from 'node:crypto';
import type { Channel, ConsumeMessage } from 'amqplib';
import { z } from 'zod';
import { prisma } from './prisma.js';

const EVENT_TYPE = 'AccountLocked';
const QUEUE_NAME = 'community.account-locks';
const accountLockedSchema = z.object({
  userId: z.string().uuid(),
  locked: z.boolean(),
  stateVersion: z.number().int().positive(),
}).passthrough();

export type AccountLockedPayload = z.infer<typeof accountLockedSchema>;

/** Applies each at-least-once AccountLocked event once inside Community's schema. */
export async function handleAccountLocked(eventId: string, payload: AccountLockedPayload): Promise<void> {
  const input = accountLockedSchema.parse(payload);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const current = await tx.accountLock.findUnique({ where: { userId: input.userId } });
    if (current && current.stateVersion >= input.stateVersion) {
      await tx.processedEvent.create({ data: { eventId } });
      return;
    }
    await tx.accountLock.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, locked: input.locked, stateVersion: input.stateVersion },
      update: { locked: input.locked, stateVersion: input.stateVersion },
    });
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
    const envelope = z.object({ type: z.literal(EVENT_TYPE), payload: accountLockedSchema })
      .passthrough().parse(JSON.parse(message.content.toString()));
    await handleAccountLocked(eventIdOf(message), envelope.payload);
    channel.ack(message);
  } catch (error) {
    console.error('[community-service AccountLocked consumer]', error);
    // Requeue vô điều kiện là bẫy poison message: event không bao giờ xử lý
    // được sẽ quay lại ngay, đốt CPU consumer + broker + DB vô hạn. Thử lại
    // đúng một lần rồi bỏ.
    channel.nack(message, false, shouldRequeue(error, message));
  }
}

export async function startAccountLockedConsumption(channel: Channel): Promise<() => Promise<void>> {
  await channel.prefetch(1);
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.bindQueue(QUEUE_NAME, 'domain-events', EVENT_TYPE);
  const inFlight = new Set<Promise<void>>();
  const consumer = await channel.consume(QUEUE_NAME, (message) => {
    const task = consumeMessage(channel, message);
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  });
  return async () => {
    await channel.cancel(consumer.consumerTag);
    await Promise.allSettled([...inFlight]);
  };
}
