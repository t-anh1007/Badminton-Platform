import { connectRabbitMQ, startOutboxRelay } from '@khoaluantn/eventbus';
import { env } from './env.js';
import { prisma } from './prisma.js';
import { fetchUnpublishedOutbox, markOutboxPublished } from './outbox.js';

/** Kết nối RabbitMQ và khởi động relay Outbox -> RabbitMQ cho account-service.
 * Trả về hàm dừng relay (dùng khi tắt service / trong test). */
export async function bootstrapEventPublishing(): Promise<() => Promise<void>> {
  const { connection, channel } = await connectRabbitMQ(env.rabbitmqUrl);
  const stopRelay = startOutboxRelay({
    channel,
    fetchUnpublished: (limit) => fetchUnpublishedOutbox(prisma, limit),
    markPublished: (ids) => markOutboxPublished(prisma, ids),
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error('[outbox-relay] error:', err);
    },
  });
  // Đóng cả kết nối chứ không chỉ dừng vòng lặp: một kết nối AMQP bỏ ngỏ giữ
  // service ở trạng thái "đang hoạt động" nên Railway không bao giờ ru ngủ.
  return async () => {
    stopRelay();
    await channel.close();
    await connection.close();
  };
}
