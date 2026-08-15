import { connectRabbitMQ, startOutboxRelay } from '@khoaluantn/eventbus';
import { env } from './env.js';
import { prisma } from './prisma.js';
import { fetchUnpublishedOutbox, markOutboxPublished } from './outbox.js';

/** Kết nối RabbitMQ và khởi động relay Outbox -> RabbitMQ cho finance-service
 * (publish PaymentCompleted — FIN-03/FIN-04). Trả về hàm dừng relay. */
export async function bootstrapEventPublishing(): Promise<() => void> {
  const { channel } = await connectRabbitMQ(env.rabbitmqUrl);
  return startOutboxRelay({
    channel,
    fetchUnpublished: (limit) => fetchUnpublishedOutbox(prisma, limit),
    markPublished: (ids) => markOutboxPublished(prisma, ids),
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error('[outbox-relay] error:', err);
    },
  });
}
