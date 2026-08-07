import { describe, expect, it, vi } from 'vitest';
import { markOutboxPublished, writeOutbox } from '../src/lib/outbox.js';

describe('community outbox', () => {
  it('writes the domain event through the caller transaction', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'outbox-1' });
    const tx = { outbox: { create } };

    await writeOutbox(tx as never, {
      aggregateType: 'Post',
      aggregateId: 'post-1',
      eventType: 'ContentReported',
      payload: { postId: 'post-1' },
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      data: {
        aggregateType: 'Post',
        aggregateId: 'post-1',
        eventType: 'ContentReported',
        payload: { postId: 'post-1' },
      },
    });
  });

  it('does not issue an update for an empty published batch', async () => {
    const updateMany = vi.fn();
    await markOutboxPublished({ outbox: { updateMany } } as never, []);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
