import type { MatchDiscipline as DbDiscipline, MatchFormat, MatchRatio as DbRatio, TeamSide } from '@prisma/client';
import type { MatchOutcome, MatchRatio } from '@khoaluantn/shared';

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

export type { MatchOutcome } from '@khoaluantn/shared';
export { allocateResultReserve } from '@khoaluantn/shared';
export interface SetScore { teamA: number; teamB: number }

export class InvalidScoreError extends Error {}

/** Set đã xong: 21 cách ≥2, hoặc 22–30 cách đúng 2, hoặc 30–29. */
function completedSetWinner({ teamA, teamB }: SetScore): 'A' | 'B' | null {
  const [high, low] = teamA > teamB ? [teamA, teamB] : [teamB, teamA];
  const done = (high === 21 && low <= 19) || (high >= 22 && high <= 30 && high - low === 2) || (high === 30 && low === 29);
  if (!done) return null;
  return teamA > teamB ? 'A' : 'B';
}

/** Set dở dang vẫn phải là tỷ số có thể xảy ra (chưa ai thắng set). */
function reachableUnfinished({ teamA, teamB }: SetScore): boolean {
  const high = Math.max(teamA, teamB);
  return high <= 20 || (high <= 29 && Math.abs(teamA - teamB) <= 1);
}

/**
 * BR-CM-24: suy ra bên thắng từ điểm từng set. Tối đa một set dở dang và phải là set cuối.
 * Hết giờ chưa đủ số set thắng: dẫn set, rồi dẫn điểm set dở; hòa thì NO_RESULT.
 */
export function inferMatchOutcome(input: { format: MatchFormat; sets: SetScore[] }): {
  outcome: MatchOutcome; setWinsA: number; setWinsB: number;
} {
  const need = input.format === 'bo5' ? 3 : 2;
  if (input.sets.length < 1 || input.sets.length > need * 2 - 1) throw new InvalidScoreError('set count');
  let setWinsA = 0;
  let setWinsB = 0;
  let unfinished: SetScore | null = null;
  for (const [index, set] of input.sets.entries()) {
    if (![set.teamA, set.teamB].every((score) => Number.isInteger(score) && score >= 0 && score <= 30)) {
      throw new InvalidScoreError('score range');
    }
    if (setWinsA === need || setWinsB === need) throw new InvalidScoreError('set after victory');
    const winner = completedSetWinner(set);
    if (winner === 'A') setWinsA += 1;
    else if (winner === 'B') setWinsB += 1;
    else if (index === input.sets.length - 1 && reachableUnfinished(set)) unfinished = set;
    else throw new InvalidScoreError('invalid set');
  }
  let outcome: MatchOutcome = 'NO_RESULT';
  if (setWinsA !== setWinsB) outcome = setWinsA > setWinsB ? 'TEAM_A_WIN' : 'TEAM_B_WIN';
  else if (unfinished && unfinished.teamA !== unfinished.teamB) {
    outcome = unfinished.teamA > unfinished.teamB ? 'TEAM_A_WIN' : 'TEAM_B_WIN';
  }
  return { outcome, setWinsA, setWinsB };
}

/**
 * Hạn phản hồi hiệu lực, dùng chung cho API, DTO và scheduler (BR-CM-31): khi đội đôi đã có người thua
 * xác nhận, grace 60 phút thay hạn 12 giờ (có thể sớm hơn hoặc vượt hạn đó); nếu không thì là hạn 12 giờ.
 */
export function objectionOpenUntil(resultCase: { objectionDeadlineAt: Date | null; teamGraceDeadlineAt: Date | null }): Date | null {
  return resultCase.teamGraceDeadlineAt ?? resultCase.objectionDeadlineAt;
}

export function losingSide(outcome: MatchOutcome | null): TeamSide | null {
  return outcome === 'TEAM_A_WIN' ? 'B' : outcome === 'TEAM_B_WIN' ? 'A' : null;
}
