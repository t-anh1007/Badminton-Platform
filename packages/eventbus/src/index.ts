// @khoaluantn/eventbus — RabbitMQ publish + Outbox Pattern relay (dùng chung).
// Không phụ thuộc Prisma trực tiếp (mỗi service tự truyền vào fetch/mark) để
// giữ eventbus là hạ tầng thuần, không chạm entity của service nào (ADR 0004).
import amqp, { type Channel, type ChannelModel } from 'amqplib';

/** Bao sự kiện tối thiểu cho Outbox Pattern. */
export interface DomainEvent<TPayload = unknown> {
  readonly type: string;
  readonly occurredAt: string;
  readonly payload: TPayload;
}

/** Một dòng Outbox — khớp cột chuẩn ở data-model.md §7. */
export interface OutboxRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}

const EXCHANGE = 'domain-events';

export async function connectRabbitMQ(url: string): Promise<{
  connection: ChannelModel;
  channel: Channel;
}> {
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  return { connection, channel };
}

/** Publish một sự kiện domain lên exchange topic chung, routing key = eventType.
 *
 * `messageId` (tùy chọn) là KHÓA IDEMPOTENCY ỔN ĐỊNH của sự kiện — với Outbox
 * Pattern phải truyền `Outbox.id`. Nếu không truyền, consumer buộc phải băm nội
 * dung message làm khóa, nhưng `occurredAt` được sinh MỚI ở mỗi lần gọi hàm này,
 * nên khi relay publish lại cùng một dòng Outbox (crash giữa publish và
 * markPublished), message có nội dung khác -> khóa khác -> consumer xử lý HAI
 * LẦN (ghi doanh thu/hoàn tiền trùng). Truyền `messageId=Outbox.id` khiến mọi
 * lần publish lại cùng một dòng mang cùng messageId -> consumer idempotent thật.
 * (Lỗi này được Codex phát hiện khi review G4 — xem decision-log D22.) */
export function publishEvent(
  channel: Channel,
  eventType: string,
  payload: unknown,
  options?: { messageId?: string },
): boolean {
  const message: DomainEvent = { type: eventType, occurredAt: new Date().toISOString(), payload };
  return channel.publish(EXCHANGE, eventType, Buffer.from(JSON.stringify(message)), {
    persistent: true,
    contentType: 'application/json',
    messageId: options?.messageId,
  });
}

export interface OutboxRelayOptions {
  channel: Channel;
  /** Lấy tối đa `limit` dòng Outbox chưa publish, đã khóa (SKIP LOCKED) phía caller. */
  fetchUnpublished: (limit: number) => Promise<OutboxRow[]>;
  /** Đánh dấu các id đã publish xong (set publishedAt). */
  markPublished: (ids: string[]) => Promise<void>;
  intervalMs?: number;
  batchSize?: number;
  onError?: (err: unknown) => void;
}

/**
 * Chạy vòng lặp relay: đọc Outbox chưa publish -> publish RabbitMQ -> đánh dấu
 * đã publish. `fetchUnpublished` phải tự đảm bảo không đọc trùng dưới tải
 * đồng thời (ví dụ SELECT ... FOR UPDATE SKIP LOCKED) — đây là trách nhiệm
 * của service gọi, vì eventbus không biết cú pháp CSDL của Prisma.
 */
export function startOutboxRelay(options: OutboxRelayOptions): () => void {
  const { channel, fetchUnpublished, markPublished, intervalMs = 500, batchSize = 20, onError } = options;
  let stopped = false;
  let ticking = false;

  const tick = async () => {
    if (stopped || ticking) return;
    ticking = true;
    try {
      const rows = await fetchUnpublished(batchSize);
      const publishedIds: string[] = [];
      for (const row of rows) {
        // messageId = Outbox.id: khóa idempotency ổn định qua mọi lần replay.
        const ok = publishEvent(channel, row.eventType, row.payload, { messageId: row.id });
        if (ok) publishedIds.push(row.id);
      }
      if (publishedIds.length > 0) await markPublished(publishedIds);
    } catch (err) {
      onError?.(err);
    } finally {
      ticking = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  void tick();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
