import type { SkillTier } from '@prisma/client';

export const INITIAL_RD = 350;
export const INITIAL_SIGMA = 0.06;
export const GLICKO_TAU = 0.5;
export const HIGH_UNCERTAINTY_RD = 200;
export const REDECLARATION_DAYS = 30;
export const MAX_REDECLARATION_SHIFT = 50;

export const TIER_CENTERS: Record<SkillTier, number> = {
  newcomer: 1100,
  beginner: 1300,
  intermediate: 1500,
  intermediate_plus: 1700,
  advanced: 1900,
};

export interface RatingState {
  rating: number;
  rd: number;
  sigma: number;
}

export interface RatingResult {
  opponentRating: number;
  opponentRd: number;
  score: number;
}

const GLICKO_SCALE = 173.7178;
const CONVERGENCE = 0.000001;

export function tierForRating(rating: number): SkillTier {
  if (rating < 1200) return 'newcomer';
  if (rating < 1400) return 'beginner';
  if (rating < 1600) return 'intermediate';
  if (rating < 1800) return 'intermediate_plus';
  return 'advanced';
}

/** Mới chơi (điểm kinh nghiệm < 1200) chỉ chơi giao hữu để lên trình; không vào trận xếp hạng của giải. */
export function isNewcomerRating(rating: number) {
  return tierForRating(rating) === 'newcomer';
}

/** Hạng đấu của mùa: Chuyên = TB+ và Bán chuyên (>= 1600); Không chuyên = Yếu và TB. */
export const PRO_DIVISION_MIN_RATING = 1600;
export type SeasonDivision = 'amateur' | 'pro';
export function divisionForRating(rating: number): SeasonDivision {
  return rating >= PRO_DIVISION_MIN_RATING ? 'pro' : 'amateur';
}

/**
 * Điểm BXH mùa theo Elo (K = 40): cộng/trừ K × (kết quả − xác suất thắng dự đoán), xác suất tính từ
 * điểm kinh nghiệm hai bên. Ngang trình: thắng +20 / thua −20; thắng người hơn 200 điểm: +30.
 */
export const SEASON_POINTS_K = 40;
export function seasonPointsDelta(ownRating: number, opponentRating: number, score: number) {
  const expected = 1 / (1 + 10 ** ((opponentRating - ownRating) / 400));
  return Math.round(SEASON_POINTS_K * (score - expected));
}

/** Độ tin cậy của điểm kinh nghiệm (RD càng nhỏ càng chắc): Cao < 100, Vừa 100–199, Thấp >= 200. */
export function confidenceForRd(rd: number): 'high' | 'medium' | 'low' {
  if (rd < 100) return 'high';
  return rd < HIGH_UNCERTAINTY_RD ? 'medium' : 'low';
}

export function describeRating(state: RatingState) {
  return {
    tier: tierForRating(state.rating),
    rating: round(state.rating),
    rd: round(state.rd),
    sigma: round(state.sigma),
    uncertainty: state.rd >= HIGH_UNCERTAINTY_RD ? 'high' as const : 'established' as const,
  };
}

export function coldStart(tier: SkillTier): RatingState {
  return { rating: TIER_CENTERS[tier], rd: INITIAL_RD, sigma: INITIAL_SIGMA };
}

/** D26: bounded declaration influence after rating history exists. */
export function redeclarationRating(current: RatingState, tier: SkillTier): RatingState {
  const uncertaintyWeight = Math.min(Math.max(current.rd / INITIAL_RD, 0), 1);
  const desiredShift = (TIER_CENTERS[tier] - current.rating) * 0.25 * uncertaintyWeight;
  const boundedShift = Math.max(-MAX_REDECLARATION_SHIFT, Math.min(MAX_REDECLARATION_SHIFT, desiredShift));
  return { ...current, rating: round(current.rating + boundedShift) };
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expected(mu: number, opponentMu: number, opponentPhi: number): number {
  return 1 / (1 + Math.exp(-g(opponentPhi) * (mu - opponentMu)));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Canonical Glicko-2 rating-period update, sorted to make identical inputs bit-deterministic. */
export function updateRating(current: RatingState, input: RatingResult[]): RatingState {
  if (input.some((result) => result.score < 0 || result.score > 1 || result.opponentRd <= 0)) {
    throw new Error('Invalid Glicko-2 result.');
  }

  const results = [...input].sort((a, b) =>
    a.opponentRating - b.opponentRating || a.opponentRd - b.opponentRd || a.score - b.score,
  );
  const mu = (current.rating - 1500) / GLICKO_SCALE;
  const phi = current.rd / GLICKO_SCALE;

  if (results.length === 0) {
    return {
      rating: round(current.rating),
      rd: round(Math.min(INITIAL_RD, GLICKO_SCALE * Math.sqrt(phi * phi + current.sigma * current.sigma))),
      sigma: round(current.sigma),
    };
  }

  const normalized = results.map((result) => ({
    ...result,
    mu: (result.opponentRating - 1500) / GLICKO_SCALE,
    phi: result.opponentRd / GLICKO_SCALE,
  }));
  const varianceInverse = normalized.reduce((sum, result) => {
    const expectation = expected(mu, result.mu, result.phi);
    const weight = g(result.phi);
    return sum + weight * weight * expectation * (1 - expectation);
  }, 0);
  const variance = 1 / varianceInverse;
  const improvement = normalized.reduce((sum, result) =>
    sum + g(result.phi) * (result.score - expected(mu, result.mu, result.phi)), 0);
  const delta = variance * improvement;

  const a = Math.log(current.sigma * current.sigma);
  const f = (x: number): number => {
    const exponent = Math.exp(x);
    const denominator = phi * phi + variance + exponent;
    return (exponent * (delta * delta - phi * phi - variance - exponent)) /
      (2 * denominator * denominator) - (x - a) / (GLICKO_TAU * GLICKO_TAU);
  };

  let lower = a;
  let upper: number;
  if (delta * delta > phi * phi + variance) {
    upper = Math.log(delta * delta - phi * phi - variance);
  } else {
    let k = 1;
    while (f(a - k * GLICKO_TAU) < 0) k += 1;
    upper = a - k * GLICKO_TAU;
  }

  let fLower = f(lower);
  let fUpper = f(upper);
  while (Math.abs(upper - lower) > CONVERGENCE) {
    const candidate = lower + ((lower - upper) * fLower) / (fUpper - fLower);
    const fCandidate = f(candidate);
    if (fCandidate * fUpper <= 0) {
      lower = upper;
      fLower = fUpper;
    } else {
      fLower /= 2;
    }
    upper = candidate;
    fUpper = fCandidate;
  }

  const sigma = Math.exp(lower / 2);
  const preRatingPhi = Math.sqrt(phi * phi + sigma * sigma);
  const newPhi = 1 / Math.sqrt(1 / (preRatingPhi * preRatingPhi) + 1 / variance);
  const newMu = mu + newPhi * newPhi * improvement;

  return {
    rating: round(1500 + GLICKO_SCALE * newMu),
    rd: round(GLICKO_SCALE * newPhi),
    sigma: round(sigma),
  };
}
