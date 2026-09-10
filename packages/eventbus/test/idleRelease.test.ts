import { afterEach, describe, expect, it, vi } from 'vitest';
import { startWithIdleRelease } from '../src/index.js';

describe('startWithIdleRelease', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts background work only once when concurrent requests resume an idle service', async () => {
    vi.useFakeTimers();
    const stopBackground = vi.fn();
    const start = vi.fn(async () => [stopBackground]);
    const handle = startWithIdleRelease({
      label: 'test-service',
      start,
      idleMs: 100,
      checkMs: 10,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(start).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(110);
    expect(stopBackground).toHaveBeenCalledTimes(1);

    handle.touch();
    handle.touch();
    handle.touch();
    handle.touch();
    await vi.advanceTimersByTimeAsync(0);

    expect(start).toHaveBeenCalledTimes(2);
    await handle.stop();
  });
});
