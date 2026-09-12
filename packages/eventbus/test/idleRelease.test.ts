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

  it('retries background startup on the next request after the initial startup fails', async () => {
    const stopBackground = vi.fn();
    const start = vi.fn()
      .mockRejectedValueOnce(new Error('RabbitMQ is temporarily unavailable'))
      .mockResolvedValue([stopBackground]);
    const handle = startWithIdleRelease({ label: 'test-service', start });

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(start).toHaveBeenCalledTimes(1);

    handle.touch();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(start).toHaveBeenCalledTimes(2);
    await handle.stop();
  });
});
