// @khoaluantn/ai — thư viện AI dùng chung (import vào nơi cần, không phải service).
// Gboot: skeleton. Tính năng AI thuộc GĐ2.

export const AI_PACKAGE_READY = true as const;

export {
  GeminiMatchmakerClient,
  enrichMatchmakerSuggestions,
  type EnrichedMatchmakerSuggestion,
  type GeminiMatchmakerClientOptions,
  type GeminiTextModel,
  type MatchmakerCandidate,
  type MatchmakerExplanation,
  type MatchmakerExplanationClient,
} from './geminiMatchmaker.js';

export interface CompatibilityInput {
  player: { rating: number; rd: number };
  match: {
    targetRating: number;
    targetRd: number;
    timeMatches: boolean;
    locationMatches: boolean;
  };
}

export interface CompatibilityResult {
  score: number;
  explanation: string;
}

/**
 * Deterministic, explainable F-02 baseline. It only ranks a suggestion; it
 * never creates a JOIN, payment, or group confirmation.
 */
export function calculateCompatibility(input: CompatibilityInput): CompatibilityResult {
  const ratingDifference = Math.round(Math.abs(input.player.rating - input.match.targetRating));
  const rdDifference = Math.round(Math.abs(input.player.rd - input.match.targetRd));
  const ratingScore = 75 * Math.max(0, 1 - ratingDifference / 500);
  const confidenceScore = 10 * Math.max(0, 1 - rdDifference / 270);
  const timeScore = input.match.timeMatches ? 8 : 0;
  const locationScore = input.match.locationMatches ? 7 : 0;
  const score = Math.round(ratingScore + confidenceScore + timeScore + locationScore);
  const reasons = [
    ratingDifference <= 100
      ? `lệch rating ${ratingDifference}, gần mục tiêu kèo`
      : `lệch rating ${ratingDifference}, chênh trình độ lớn`,
    rdDifference <= 100
      ? 'độ tin cậy rating tương đương'
      : 'độ tin cậy rating khác biệt',
    input.match.timeMatches ? 'khớp khung giờ' : 'chưa có dữ liệu khung giờ',
    input.match.locationMatches ? 'cùng khu vực' : 'chưa có dữ liệu khu vực',
  ];
  return {
    score,
    explanation: score >= 50
      ? `Phù hợp vì ${reasons.join(', ')}.`
      : `Điểm thấp vì ${reasons.join(', ')}.`,
  };
}

export interface GroupingCandidate {
  userId: string;
  rating: number;
}

export interface GroupSuggestion {
  memberUserIds: string[];
  ratingMean: number;
  ratingVariance: number;
  explanation: string;
}

export interface BalancedGroupProposal {
  groups: GroupSuggestion[];
  unmatchedUserIds: string[];
  unmatchedExplanation: string;
  requiresConfirmation: true;
  createdMatchIds: [];
  paymentActions: [];
}

/**
 * Sort-and-partition minimizes within-group spread for one-dimensional rating
 * data at a fixed capacity. It returns proposals only; callers own any later
 * confirmation, match creation, and finance flow.
 */
export function suggestBalancedGroups(
  candidates: readonly GroupingCandidate[],
  capacity: number,
): BalancedGroupProposal {
  if (!Number.isInteger(capacity) || capacity < 2) {
    throw new Error('Group capacity must be an integer of at least two.');
  }
  const ordered = [...candidates].sort((left, right) => left.rating - right.rating
    || left.userId.localeCompare(right.userId));
  const completeCount = Math.floor(ordered.length / capacity) * capacity;
  const groups: GroupSuggestion[] = [];
  for (let start = 0; start < completeCount; start += capacity) {
    const members = ordered.slice(start, start + capacity);
    const ratingMean = members.reduce((sum, member) => sum + member.rating, 0) / capacity;
    const ratingVariance = members.reduce(
      (sum, member) => sum + (member.rating - ratingMean) ** 2,
      0,
    ) / capacity;
    groups.push({
      memberUserIds: members.map((member) => member.userId),
      ratingMean,
      ratingVariance,
      explanation: `Nhóm có rating trung bình ${Math.round(ratingMean)} và phương sai ${Math.round(ratingVariance)}.`,
    });
  }
  const unmatchedUserIds = ordered.slice(completeCount).map((candidate) => candidate.userId);
  return {
    groups,
    unmatchedUserIds,
    unmatchedExplanation: unmatchedUserIds.length === 0
      ? 'Đã ghép hết người chơi.'
      : `Còn ${unmatchedUserIds.length} người chưa ghép vì chưa đủ ${capacity} người cho một nhóm cân bằng.`,
    requiresConfirmation: true,
    createdMatchIds: [],
    paymentActions: [],
  };
}
