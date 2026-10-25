// Cửa sổ theo mức tin cậy và giãn qua đêm (BR-RA-20, 20a). Hàm thuần; giờ VN = UTC+7, không DST.

export type Level = 'green' | 'yellow' | 'red';

const HOUR_MS = 3_600_000;
const VN_OFFSET_MS = 7 * HOUR_MS;
const DEFAULT_WINDOWS = { green: 2 * HOUR_MS, yellow: 6 * HOUR_MS, red: 12 * HOUR_MS, grace: HOUR_MS, evidence: 2 * HOUR_MS, appeal: 6 * HOUR_MS };
export type ResultWindows = typeof DEFAULT_WINDOWS;

/** `RESULT_WINDOWS=green:2h,yellow:6h,…` (đơn vị h hoặc m); thiếu/sai thì giữ mặc định. */
export function resultWindows(env: Record<string, string | undefined> = process.env): ResultWindows {
  const windows = { ...DEFAULT_WINDOWS };
  for (const entry of (env.RESULT_WINDOWS ?? '').split(',')) {
    const match = /^\s*(\w+)\s*:\s*(\d+(?:\.\d+)?)\s*([hm])\s*$/.exec(entry);
    if (!match || !(match[1]! in windows)) continue;
    windows[match[1] as keyof ResultWindows] = Number(match[2]) * (match[3] === 'h' ? HOUR_MS : 60_000);
  }
  return windows;
}

/** Hạn rơi vào [23:00, 07:00) giờ VN thì dời tới 08:00 sáng kế tiếp; áp một lần trên hạn cuối. */
export function effectiveDeadline(base: Date): Date {
  const local = new Date(base.getTime() + VN_OFFSET_MS);
  const hour = local.getUTCHours();
  if (hour >= 7 && hour < 23) return base;
  const morning = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (hour >= 23 ? 1 : 0), 8);
  return new Date(morning - VN_OFFSET_MS);
}

export function deadlineFor(start: Date, durationMs: number): { baseAt: Date; at: Date } {
  const baseAt = new Date(start.getTime() + durationMs);
  return { baseAt, at: effectiveDeadline(baseAt) };
}
