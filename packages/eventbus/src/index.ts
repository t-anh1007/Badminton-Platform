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
  /** Chu kỳ poll Outbox. Mặc định 5s — poll dày (500ms cũ) giữ kết nối DB
   * luôn bận nên Railway không bao giờ ngủ được service. Đặt
   * OUTBOX_RELAY_INTERVAL_MS để rút ngắn khi chạy test/local. */
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
  const {
    channel, fetchUnpublished, markPublished,
    intervalMs = Number(process.env.OUTBOX_RELAY_INTERVAL_MS ?? 5000),
    batchSize = 20, onError,
  } = options;
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

/** Payload hỏng thì giao lại bao nhiêu lần cũng hỏng — nhận diện để bỏ sớm.
 * So khớp theo `name` chứ không dùng `instanceof`: mỗi service cài bản zod
 * riêng nên `instanceof ZodError` xuyên package có thể trả về false. */
function isPermanentEventError(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'ZodError' || name === 'SyntaxError';
}

/** Quyết định có requeue một message xử lý lỗi hay không.
 *
 * `channel.nack(msg, false, true)` vô điều kiện là bẫy poison message: một
 * event không bao giờ xử lý thành công được sẽ quay lại NGAY LẬP TỨC, đốt CPU
 * của consumer + broker + database cho tới khi có người phát hiện.
 *
 * Quy tắc:
 *  - Payload hỏng → bỏ ngay, giao lại không cứu được.
 *  - Lỗi khác → thử lại ĐÚNG MỘT LẦN (dùng cờ `redelivered` của RabbitMQ), đủ
 *    vượt trục trặc tạm thời của DB/broker mà không tạo vòng lặp vô hạn.
 *
 * Consumer nào có bảng quarantine thì nên lưu event lại trước khi bỏ, để không
 * mất dữ liệu nghiệp vụ. */
export function shouldRequeue(
  error: unknown,
  message: { readonly fields?: { readonly redelivered?: boolean } } | null | undefined,
): boolean {
  if (isPermanentEventError(error)) return false;
  // Message thiếu `fields` (test double, broker lạ) được coi là lần giao đầu.
  return message?.fields?.redelivered !== true;
}


// --- Buông kết nối khi rảnh (để Railway serverless ngủ được) ---------------
// Railway dừng service sau 10 phút KHÔNG có hoạt động outbound, và service đã
// ngủ không tính phí compute. Nhưng outbox relay poll DB, kết nối AMQP và
// connection pool của Prisma/Redis đều tính là hoạt động — nên service giữ
// chúng mở sẽ không bao giờ ngủ. Helper này buông hết việc nền sau một khoảng
// không có request, để Railway ru ngủ được, rồi dựng lại khi có request mới.

export interface IdleReleaseOptions {
  /** Tên service, chỉ dùng cho log. */
  label: string;
  /** Khởi động việc nền (relay, consumer, scheduler). Trả về các hàm dừng. */
  start: () => Promise<Array<() => void | Promise<void>>>;
  /** Dọn thêm khi buông — đóng Prisma, Redis... */
  onRelease?: () => Promise<void> | void;
  /** Chuẩn bị trước khi `start` chạy lại — mở lại Redis... */
  onResume?: () => Promise<void> | void;
  /** Rảnh bao lâu thì buông. Mặc định 5 phút; đặt 0 để tắt hẳn cơ chế này. */
  idleMs?: number;
  /** Chu kỳ kiểm tra. Mặc định 30s. */
  checkMs?: number;
}

export interface IdleReleaseHandle {
  /** Đánh dấu vừa có hoạt động; dựng lại việc nền nếu đang buông. */
  touch: () => void;
  /** Dừng hẳn — dùng khi tắt service hoặc trong test. */
  stop: () => Promise<void>;
}

let activeHandle: IdleReleaseHandle | null = null;

/** Gọi từ middleware HTTP của service. An toàn khi chưa có handle nào. */
export function markActivity(): void {
  activeHandle?.touch();
}

export function startWithIdleRelease(options: IdleReleaseOptions): IdleReleaseHandle {
  const {
    label,
    start,
    onRelease,
    onResume,
    idleMs = Number(process.env.IDLE_RELEASE_MS ?? 300_000),
    checkMs = Number(process.env.IDLE_CHECK_MS ?? 30_000),
  } = options;

  let stops: Array<() => void | Promise<void>> = [];
  let released = false;
  let stopped = false;
  let lastActivity = Date.now();
  // Nối tiếp mọi lần bật/tắt để touch() giữa chừng không chạy đua với release().
  let chain: Promise<void> = Promise.resolve();

  const log = (message: string) => {
    // eslint-disable-next-line no-console
    console.log(`[${label}] ${message}`);
  };
  const logError = (message: string, err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[${label}] ${message}`, err);
  };

  const queue = (task: () => Promise<void>): Promise<void> => {
    chain = chain.then(task, task);
    return chain;
  };

  const runStart = async () => {
    if (stopped) return;
    try {
      await onResume?.();
      stops = await start();
      released = false;
    } catch (err) {
      logError('không dựng lại được việc nền:', err);
    }
  };

  const runRelease = async () => {
    if (stopped || released) return;
    for (const stop of stops) {
      try {
        await stop();
      } catch (err) {
        logError('lỗi khi dừng việc nền:', err);
      }
    }
    stops = [];
    try {
      await onRelease?.();
    } catch (err) {
      logError('lỗi khi dọn kết nối:', err);
    }
    released = true;
    log(`rảnh ${Math.round(idleMs / 1000)}s — đã buông kết nối nền, chờ Railway ru ngủ`);
  };

  void queue(runStart);

  const handle: IdleReleaseHandle = {
    touch: () => {
      lastActivity = Date.now();
      if (released && !stopped) {
        log('có request khi đang buông — dựng lại việc nền');
        void queue(runStart);
      }
    },
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await queue(async () => {
        for (const stop of stops) {
          try {
            await stop();
          } catch (err) {
            logError('lỗi khi dừng việc nền:', err);
          }
        }
        stops = [];
      });
      if (activeHandle === handle) activeHandle = null;
    },
  };

  const timer = setInterval(() => {
    if (stopped || released) return;
    if (Date.now() - lastActivity < idleMs) return;
    void queue(runRelease);
  }, checkMs);
  timer.unref();

  // idleMs = 0 nghĩa là tắt cơ chế: chạy nền liên tục như trước.
  if (idleMs <= 0) clearInterval(timer);

  activeHandle = handle;
  return handle;
}
