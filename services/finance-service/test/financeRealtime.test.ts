import { describe, expect, it } from 'vitest';
import { FinanceRealtimeHub } from '../src/realtime/financeRealtimeHub.js';

describe('owner finance realtime hub', () => {
  it('only broadcasts a deduplicated invalidation to its owner', () => {
    const hub = new FinanceRealtimeHub();
    const owner = { chunks: [] as string[] };
    const other = { chunks: [] as string[] };
    hub.subscribe('owner-1', (chunk) => owner.chunks.push(chunk));
    hub.subscribe('owner-2', (chunk) => other.chunks.push(chunk));

    hub.publish('event-1', { sellerUserId: 'owner-1', scopes: ['wallet', 'ledger'] }, '2026-09-10T00:00:00.000Z');
    hub.publish('event-1', { sellerUserId: 'owner-1', scopes: ['wallet', 'ledger'] }, '2026-09-10T00:00:00.000Z');

    expect(owner.chunks).toEqual([expect.stringContaining('"scopes":["wallet","ledger"]')]);
    expect(other.chunks).toEqual([]);
    expect(owner.chunks.join('')).not.toContain('amount');
  });
});
