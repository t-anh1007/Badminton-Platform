import type { FinanceUiInvalidatedPayload } from './financeInvalidation.js';

export type FinanceRealtimeListener = (chunk: string) => void;

const eventChunk = (id: string, payload: FinanceUiInvalidatedPayload, occurredAt: string) =>
  `id: ${id}\nevent: finance-invalidated\ndata: ${JSON.stringify({ scopes: payload.scopes, occurredAt })}\n\n`;

export class FinanceRealtimeHub {
  private readonly listeners = new Map<string, Set<FinanceRealtimeListener>>();
  private readonly recentEventIds = new Set<string>();

  subscribe(userId: string, listener: FinanceRealtimeListener): () => void {
    const userListeners = this.listeners.get(userId) ?? new Set<FinanceRealtimeListener>();
    userListeners.add(listener);
    this.listeners.set(userId, userListeners);
    return () => {
      userListeners.delete(listener);
      if (userListeners.size === 0) this.listeners.delete(userId);
    };
  }

  publish(eventId: string, payload: FinanceUiInvalidatedPayload, occurredAt: string): void {
    if (this.recentEventIds.has(eventId)) return;
    this.recentEventIds.add(eventId);
    if (this.recentEventIds.size > 500) this.recentEventIds.delete(this.recentEventIds.values().next().value as string);
    const chunk = eventChunk(eventId, payload, occurredAt);
    for (const listener of this.listeners.get(payload.sellerUserId) ?? []) listener(chunk);
  }

  connectionCount(): number {
    return [...this.listeners.values()].reduce((total, userListeners) => total + userListeners.size, 0);
  }
}
