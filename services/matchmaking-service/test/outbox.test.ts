import { describe, expect, it, vi } from 'vitest';
import { markOutboxPublished, writeOutbox } from '../src/lib/outbox.js';

describe('matchmaking outbox', () => {
  it('writes the domain event through the caller transaction', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'outbox-1' });
    const tx = { outbox: { create } };

    await writeOutbox(tx as never, {
      aggregateType: 'Match',
      aggregateId: 'match-1',
      eventType: 'MatchCreated',
      payload: { matchId: 'match-1' },
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      data: {
        aggregateType: 'Match',
        aggregateId: 'match-1',
        eventType: 'MatchCreated',
        payload: { matchId: 'match-1' },
      },
    });
  });

  it('does not issue an update for an empty published batch', async () => {
    const updateMany = vi.fn();
    await markOutboxPublished({ outbox: { updateMany } } as never, []);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
