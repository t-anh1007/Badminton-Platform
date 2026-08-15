import { connectRabbitMQ, startOutboxRelay } from '@khoaluantn/eventbus';
import { prisma } from './prisma.js';
import { fetchUnpublishedOutbox, markOutboxPublished } from './outbox.js';
import { startAccountLockedConsumption } from './accountLockedConsumer.js';

/** Starts community's Outbox relay. AccountLocked consumption is added in P2-M8. */
export async function bootstrapEventPublishing(): Promise<() => Promise<void>> {
  const { connection, channel } = await connectRabbitMQ(
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  );
  const stopRelay = startOutboxRelay({
    channel,
    fetchUnpublished: (limit) => fetchUnpublishedOutbox(prisma, limit),
    markPublished: (ids) => markOutboxPublished(prisma, ids),
    onError: (err) => console.error('[community-service outbox]', err),
  });
  const stopAccountLockedConsumption = await startAccountLockedConsumption(channel);
  return async () => {
    stopRelay();
    await stopAccountLockedConsumption();
    await channel.close();
    await connection.close();
  };
}
