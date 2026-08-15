import { connectRabbitMQ, startOutboxRelay } from '@khoaluantn/eventbus';
import { prisma } from './prisma.js';
import { fetchUnpublishedOutbox, markOutboxPublished } from './outbox.js';

/** Starts matchmaking's Outbox relay. Consumers are added with their owning milestone. */
export async function bootstrapEventPublishing(): Promise<() => Promise<void>> {
  const { connection, channel } = await connectRabbitMQ(
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  );
  const stopRelay = startOutboxRelay({
    channel,
    fetchUnpublished: (limit) => fetchUnpublishedOutbox(prisma, limit),
    markPublished: (ids) => markOutboxPublished(prisma, ids),
    onError: (err) => console.error('[matchmaking-service outbox]', err),
  });
  return async () => {
    stopRelay();
    await channel.close();
    await connection.close();
  };
}
