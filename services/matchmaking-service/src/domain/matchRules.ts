import type { MatchDiscipline as DbDiscipline, MatchFormat, MatchRatio as DbRatio, TeamSide } from '@prisma/client';
import type { MatchRatio } from '@khoaluantn/shared';

// Kèo cạnh tranh v2 — quy tắc thuần, không I/O (competitive-matches.md §3-4).

export const RATIO_TO_DB: Record<MatchRatio, DbRatio> = { '5:5': 'five_five', '6:4': 'six_four', '7:3': 'seven_three' };
export const RATIO_FROM_DB: Record<DbRatio, MatchRatio> = { five_five: '5:5', six_four: '6:4', seven_three: '7:3' };
/** Phần của bên thua trên 10; bên thắng là phần còn lại. */
const LOSER_PART: Record<MatchRatio, bigint> = { '5:5': 5n, '6:4': 6n, '7:3': 7n };

export function teamSize(discipline: DbDiscipline): 1 | 2 {
  return discipline === 'doubles' ? 2 : 1;
}

export function capacityOf(discipline: DbDiscipline): 2 | 4 {
  return discipline === 'doubles' ? 4 : 2;
}

/** Số slot người tham gia của mỗi đội; chủ kèo luôn chiếm một chỗ ở đội A (BR-CM-05). */
export function participantSlots(discipline: DbDiscipline, side: TeamSide): number {
  return side === 'A' ? teamSize(discipline) - 1 : teamSize(discipline);
}

/** BR-CM-08: booking <=90 phút chỉ BO3; >90 phút cho BO3 hoặc BO5. */
export function formatAllowed(format: MatchFormat, startAt: Date, endAt: Date): boolean {
  return format === 'bo3' || endAt.getTime() - startAt.getTime() > 90 * 60_000;
}

/**
 * BR-CM-10..15: mọi bên ký quỹ theo mức tối đa bên thua có thể chịu. Chỉ số nguyên VND;
 * chủ kèo hấp thụ toàn bộ phần lẻ nên tổng luôn khớp tuyệt đối.
 */
export function calculateMatchFunding(price: bigint, ratio: MatchRatio, capacity: 2 | 4) {
  if (price < 0n) throw new RangeError('price must not be negative');
  const loserPart = LOSER_PART[ratio];
  const resultReserve = (price * (loserPart - (10n - loserPart))) / 10n;
  const totalContribution = price + resultReserve;
  const slots = BigInt(capacity);
  const feePerSlot = totalContribution / slots;
  const organizerContribution = totalContribution - feePerSlot * (slots - 1n);
  return { resultReserve, totalContribution, feePerSlot, organizerContribution };
}
