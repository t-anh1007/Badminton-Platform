import { z } from 'zod';

// Kèo cạnh tranh v2 (specs/competitive-matches.md, D56-D57) — contract only.

export type MatchSourceType = 'hold' | 'paid_booking';
export type MatchMode = 'friendly' | 'ranked';
export type MatchDiscipline = 'singles' | 'doubles';
/** Đọc theo bên thua : bên thắng. */
export type MatchRatio = '5:5' | '6:4' | '7:3';
export type MatchFormat = 'bo3' | 'bo5';
export type TeamSide = 'A' | 'B';
export type MatchOutcome = 'TEAM_A_WIN' | 'TEAM_B_WIN' | 'NO_RESULT';

/** 34 đơn vị hành chính cấp tỉnh theo Nghị quyết 202/2025/QH15. `code` là slug ổn định, không đổi khi đổi tên hiển thị. */
export const VIETNAM_PROVINCES = [
  { code: 'ha-noi', name: 'Hà Nội' },
  { code: 'hai-phong', name: 'Hải Phòng' },
  { code: 'hue', name: 'Huế' },
  { code: 'da-nang', name: 'Đà Nẵng' },
  { code: 'can-tho', name: 'Cần Thơ' },
  { code: 'ho-chi-minh', name: 'Thành phố Hồ Chí Minh' },
  { code: 'lai-chau', name: 'Lai Châu' },
  { code: 'dien-bien', name: 'Điện Biên' },
  { code: 'son-la', name: 'Sơn La' },
  { code: 'lang-son', name: 'Lạng Sơn' },
  { code: 'cao-bang', name: 'Cao Bằng' },
  { code: 'tuyen-quang', name: 'Tuyên Quang' },
  { code: 'lao-cai', name: 'Lào Cai' },
  { code: 'thai-nguyen', name: 'Thái Nguyên' },
  { code: 'phu-tho', name: 'Phú Thọ' },
  { code: 'bac-ninh', name: 'Bắc Ninh' },
  { code: 'hung-yen', name: 'Hưng Yên' },
  { code: 'ninh-binh', name: 'Ninh Bình' },
  { code: 'quang-ninh', name: 'Quảng Ninh' },
  { code: 'thanh-hoa', name: 'Thanh Hóa' },
  { code: 'nghe-an', name: 'Nghệ An' },
  { code: 'ha-tinh', name: 'Hà Tĩnh' },
  { code: 'quang-tri', name: 'Quảng Trị' },
  { code: 'quang-ngai', name: 'Quảng Ngãi' },
  { code: 'gia-lai', name: 'Gia Lai' },
  { code: 'khanh-hoa', name: 'Khánh Hòa' },
  { code: 'lam-dong', name: 'Lâm Đồng' },
  { code: 'dak-lak', name: 'Đắk Lắk' },
  { code: 'dong-nai', name: 'Đồng Nai' },
  { code: 'tay-ninh', name: 'Tây Ninh' },
  { code: 'vinh-long', name: 'Vĩnh Long' },
  { code: 'dong-thap', name: 'Đồng Tháp' },
  { code: 'ca-mau', name: 'Cà Mau' },
  { code: 'an-giang', name: 'An Giang' },
] as const satisfies readonly { code: string; name: string }[];

export const vietnamProvinceCodeSchema = z.enum(VIETNAM_PROVINCES.map((province) => province.code) as [string, ...string[]]);

/** Phát từ bộ chốt kết quả duy nhất (không tranh chấp hoặc Admin xác nhận). Finance tự tính phân bổ từ funding đã lưu. */
export interface MatchResultFinalizedPayload {
  matchId: string;
  decisionId: string;
  outcome: MatchOutcome;
  finalizedAt: string;
}

export interface RewardAwardsFinalizedPayload {
  programId: string;
  /** Tên chương trình để Finance hiển thị nhãn giải cho người nhận. */
  programName: string;
  awards: Array<{ awardId: string; userId: string; rank: number; amount: string; claimDeadlineAt: string }>;
}

/**
 * BR-CM-16..22 (Matchmaking preview và Finance Task 14 dùng chung): thắng nhận toàn bộ reserve; NO_RESULT chia
 * floor/2 cho A, phần còn lại cho B. Trong đội chia đều, phần lẻ cho chủ kèo nếu ở đội đó,
 * nếu không cho người JOIN sớm nhất. `teams` theo thứ tự JOIN, chủ kèo đứng đầu đội A.
 */
export function allocateResultReserve(
  reserve: bigint,
  outcome: MatchOutcome,
  teams: Record<TeamSide, string[]>,
): Map<string, bigint> {
  const teamAmounts: Array<[TeamSide, bigint]> = outcome === 'TEAM_A_WIN' ? [['A', reserve]]
    : outcome === 'TEAM_B_WIN' ? [['B', reserve]]
    : [['A', reserve / 2n], ['B', reserve - reserve / 2n]];
  const allocations = new Map<string, bigint>();
  for (const [side, amount] of teamAmounts) {
    const members = teams[side];
    if (members.length === 0) throw new RangeError(`team ${side} is empty`);
    const share = amount / BigInt(members.length);
    members.forEach((userId, index) => {
      allocations.set(userId, (allocations.get(userId) ?? 0n) + share + (index === 0 ? amount - share * BigInt(members.length) : 0n));
    });
  }
  return allocations;
}

/** BR-CM-53/54: Admin duyệt ticket sửa khai báo trình độ; Matchmaking áp dụng có giới hạn và audit. */
export interface RatingCorrectionApprovedPayload {
  ticketId: string;
  userId: string;
  discipline: MatchDiscipline;
  approvedTier: 'newcomer' | 'beginner' | 'intermediate' | 'intermediate_plus' | 'advanced';
  adminUserId: string;
}
