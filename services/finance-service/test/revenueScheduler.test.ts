import { describe, expect, it, vi } from 'vitest';

let finishTick: () => void = () => {};
vi.mock('../src/domain/revenueRelease.js', () => ({
  releaseMatureRevenue: vi.fn(() => new Promise<number>((resolve) => { finishTick = () => resolve(0); })),
}));

const { startRevenueReleaseScheduler } = await import('../src/lib/revenueScheduler.js');

describe('revenue release scheduler', () => {
  // P2028 trên prod: idle release gọi prisma.$disconnect() khi lượt đáo hạn còn dở transaction.
  it('stop waits for the in-flight tick before the caller disconnects Prisma', async () => {
    const stop = startRevenueReleaseScheduler();
    let stopped = false;
    const stopping = Promise.resolve(stop()).then(() => { stopped = true; });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(stopped).toBe(false);

    finishTick();
    await stopping;
    expect(stopped).toBe(true);
  });
});
