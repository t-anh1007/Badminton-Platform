import { describe, expect, it, vi } from 'vitest';
import { startAccountLockedConsumption } from '../src/lib/accountLockedConsumer.js';

describe('AccountLocked RabbitMQ consumer', () => {
  it('rejects malformed messages without requeueing them forever', async () => {
    let callback: ((message: { content: Buffer; properties: { messageId?: string } } | null) => void) | undefined;
    const channel = {
      prefetch: vi.fn().mockResolvedValue(undefined),
      assertQueue: vi.fn().mockResolvedValue(undefined),
      bindQueue: vi.fn().mockResolvedValue(undefined),
      consume: vi.fn().mockImplementation(async (_queue, handler) => {
        callback = handler;
        return { consumerTag: 'consumer-1' };
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
      ack: vi.fn(),
      nack: vi.fn(),
    };

    const stop = await startAccountLockedConsumption(channel as never);
    const malformed = { content: Buffer.from('{not-json'), properties: {} };
    callback!(malformed);
    await vi.waitFor(() => expect(channel.nack).toHaveBeenCalledWith(malformed, false, false));
    await stop();
    expect(channel.cancel).toHaveBeenCalledWith('consumer-1');
  });

  // Hồi quy: một event hợp lệ nhưng vi phạm quy tắc nghiệp vụ (lỗi Error thường,
  // không phải ZodError) từng được requeue vô điều kiện, khiến finance-service
  // quay ~100 event/giây suốt nhiều ngày. Lần giao lại thứ hai phải dừng hẳn.
  it('stops requeueing a poison message after the first redelivery', async () => {
    let callback: ((message: unknown) => void) | undefined;
    const channel = {
      prefetch: vi.fn().mockResolvedValue(undefined),
      assertQueue: vi.fn().mockResolvedValue(undefined),
      bindQueue: vi.fn().mockResolvedValue(undefined),
      consume: vi.fn().mockImplementation(async (_queue, handler) => {
        callback = handler;
        return { consumerTag: 'consumer-poison' };
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
      ack: vi.fn(),
      nack: vi.fn(),
    };

    const stop = await startAccountLockedConsumption(channel as never);
    // Payload đúng JSON nhưng sai schema -> handler ném lỗi ở mọi lần giao.
    const content = Buffer.from(JSON.stringify({ type: 'AccountLocked', payload: { nope: true } }));

    const firstDelivery = { content, properties: {}, fields: { redelivered: false } };
    callback!(firstDelivery);
    await vi.waitFor(() => expect(channel.nack).toHaveBeenCalledWith(firstDelivery, false, expect.any(Boolean)));

    const redelivery = { content, properties: {}, fields: { redelivered: true } };
    callback!(redelivery);
    await vi.waitFor(() => expect(channel.nack).toHaveBeenCalledWith(redelivery, false, false));

    await stop();
  });
});
