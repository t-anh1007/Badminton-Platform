import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { markActivity } = vi.hoisted(() => ({ markActivity: vi.fn() }));
vi.mock('@khoaluantn/eventbus', () => ({ markActivity }));

import { subscribeNotificationSignals } from '../src/lib/notificationRealtime.js';

describe('notification realtime heartbeat', () => {
  afterEach(() => {
    vi.useRealTimers();
    markActivity.mockReset();
  });

  it('keeps background consumers active only while a subscriber is connected', async () => {
    vi.useFakeTimers();
    const response = { write: vi.fn() } as unknown as Response;
    const unsubscribe = subscribeNotificationSignals('user-1', response);

    await vi.advanceTimersByTimeAsync(25_000);
    expect(markActivity).toHaveBeenCalledTimes(1);

    unsubscribe();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(markActivity).toHaveBeenCalledTimes(1);
  });
});
