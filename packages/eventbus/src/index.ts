// @khoaluantn/eventbus — helper RabbitMQ + Outbox Pattern (contract/skeleton).
// Gboot: chưa nối RabbitMQ thật. Chỉ khai báo hình dạng để G1..G7 hiện thực.

/** Bao sự kiện tối thiểu cho Outbox Pattern. */
export interface DomainEvent<TPayload = unknown> {
  readonly type: string;
  readonly occurredAt: string;
  readonly payload: TPayload;
}
