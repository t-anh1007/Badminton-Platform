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
});
