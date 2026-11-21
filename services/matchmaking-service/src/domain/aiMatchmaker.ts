import {
  calculateCompatibility,
  enrichMatchmakerSuggestions,
  type MatchmakerCandidate,
  type MatchmakerExplanationClient,
} from '@khoaluantn/ai';
import type { SkillTier } from '@prisma/client';
import type { VenueBookingClient } from '../clients/venueBooking.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { findPublicMatches, type MatchSearchFilters } from './matches.js';
import { INITIAL_RD, TIER_CENTERS, tierForRating } from './rating.js';

export type AiMatchSearchFilters = Omit<MatchSearchFilters, 'skill'>;

export interface PlayerLocation {
  lat: number;
  lng: number;
}

const TIER_ORDER: readonly SkillTier[] = ['newcomer', 'beginner', 'intermediate', 'intermediate_plus', 'advanced'];
export const TIER_LABELS: Record<SkillTier, string> = {
  newcomer: 'Mới chơi',
  beginner: 'Yếu',
  intermediate: 'TB',
  intermediate_plus: 'TB+',
  advanced: 'Bán chuyên',
};
/** PO 21/11/2026: đối thủ cùng trình độ hoặc chênh tối đa 2 bậc. */
const MAX_TIER_GAP = 2;
const MAX_SUGGESTIONS = 5;
/** Mỗi km trừ 1 điểm xếp hạng, tối đa 30 — gần hơn thì ưu tiên hơn khi điểm F-02 ngang nhau. */
const DISTANCE_PENALTY_CAP_KM = 30;

function distanceKm(from: PlayerLocation, to: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function summarizeTiers(tiers: readonly SkillTier[]): string {
  const counts = new Map<SkillTier, number>();
  for (const tier of tiers) counts.set(tier, (counts.get(tier) ?? 0) + 1);
  return TIER_ORDER.filter((tier) => counts.has(tier)).map((tier) => `${counts.get(tier)} ${TIER_LABELS[tier]}`).join(', ');
}

export async function suggestAiMatches(
  venueBookingClient: VenueBookingClient,
  playerUserId: string,
  filters: AiMatchSearchFilters,
  matchmakerClient?: MatchmakerExplanationClient,
  location?: PlayerLocation,
) {
  const passports = new Map((await prisma.passport.findMany({ where: { userId: playerUserId } }))
    .map((passport) => [passport.discipline, passport]));
  if (passports.size === 0) {
    throw new AppError(409, 'PASSPORT_REQUIRED', 'Create a Passport before requesting match suggestions.');
  }

  // Chỉ gợi ý kèo thuộc loại hình người chơi đã có Passport (BR-CM-44).
  const matches = (await findPublicMatches(venueBookingClient, { ...filters, skill: undefined }))
    .filter((match) => match.organizerUserId !== playerUserId && passports.has(match.discipline));

  // Thành viên hiện có của từng kèo (chủ kèo + người đã được duyệt/xác nhận) → bậc trình độ ẩn danh.
  const joins = matches.length === 0 ? [] : await prisma.join.findMany({
    where: { matchId: { in: matches.map((match) => match.id) }, status: { in: ['approved', 'confirmed'] } },
    select: { matchId: true, participantUserId: true },
  });
  const memberIdsByMatch = new Map<string, string[]>(matches.map((match) => [match.id, [match.organizerUserId]]));
  for (const join of joins) memberIdsByMatch.get(join.matchId)?.push(join.participantUserId);
  const memberUserIds = [...new Set([...memberIdsByMatch.values()].flat())];
  const memberPassports = memberUserIds.length === 0 ? [] : await prisma.passport.findMany({
    where: { userId: { in: memberUserIds } },
    select: { userId: true, discipline: true, ratingMu: true },
  });
  const memberRating = new Map(memberPassports.map((passport) => [`${passport.userId}:${passport.discipline}`, passport.ratingMu]));

  const entries = matches.flatMap((match) => {
    const passport = passports.get(match.discipline)!;
    const playerTier = tierForRating(passport.ratingMu);
    const memberTiers = (memberIdsByMatch.get(match.id) ?? [])
      .map((userId) => memberRating.get(`${userId}:${match.discipline}`))
      .filter((rating): rating is number => rating !== undefined)
      .map(tierForRating);
    const maxGap = Math.max(0, ...memberTiers.map((tier) => Math.abs(TIER_ORDER.indexOf(tier) - TIER_ORDER.indexOf(playerTier))));
    if (maxGap > MAX_TIER_GAP) return [];

    const skillMin = match.skillMin ?? match.skillMax;
    const skillMax = match.skillMax ?? match.skillMin;
    const targetRating = skillMin && skillMax
      ? (TIER_CENTERS[skillMin] + TIER_CENTERS[skillMax]) / 2
      : 1500;
    const compatibility = calculateCompatibility({
      player: { rating: passport.ratingMu, rd: passport.ratingRd },
      match: {
        targetRating,
        targetRd: INITIAL_RD,
        // Query filters are the player's explicit time/location preferences.
        timeMatches: filters.startFrom !== undefined || filters.endBefore !== undefined,
        locationMatches: filters.area !== undefined,
      },
    });
    const distance = location ? distanceKm(location, match.venue) : null;
    const memberSummary = summarizeTiers(memberTiers);
    const reasons = [
      compatibility.explanation,
      maxGap === 0 ? `Đối thủ cùng trình độ ${TIER_LABELS[playerTier]} với bạn.` : `Thành viên chênh tối đa ${maxGap} bậc so với bạn (${TIER_LABELS[playerTier]}).`,
      ...(distance === null ? [] : [`Sân cách bạn khoảng ${distance} km.`]),
      `Còn ${match.openSlots} chỗ trống.`,
    ];
    const candidate: MatchmakerCandidate = {
      matchId: match.id,
      score: compatibility.score,
      fallbackExplanation: `Điểm F-02 ${compatibility.score}: ${reasons.slice(1).join(' ')}`,
      groundedReasons: reasons,
      publicDetails: {
        skillMin: match.skillMin,
        skillMax: match.skillMax,
        startAt: match.startAt,
        venueName: match.venue.name,
        courtName: match.court.name,
        feePerSlot: match.feePerSlot,
      },
    };
    const rank = compatibility.score - Math.min(distance ?? 0, DISTANCE_PENALTY_CAP_KM);
    return [{ match, candidate, rank, distance, memberSummary, memberTiers, playerTier }];
  }).sort((left, right) => right.rank - left.rank
    || left.match.startAt.localeCompare(right.match.startAt))
    .slice(0, MAX_SUGGESTIONS);

  const enriched = await enrichMatchmakerSuggestions(
    entries.map((entry) => entry.candidate),
    matchmakerClient,
  );
  const entryByMatchId = new Map(entries.map((entry) => [entry.match.id, entry]));
  return enriched.map((suggestion) => {
    const entry = entryByMatchId.get(suggestion.matchId)!;
    const { match } = entry;
    return {
      ...suggestion,
      joinPath: `/matches/${match.id}/joins`,
      distanceKm: entry.distance,
      playerTier: TIER_LABELS[entry.playerTier],
      memberSummary: entry.memberSummary,
      memberTiers: entry.memberTiers.map((tier) => TIER_LABELS[tier]),
      match: {
        id: match.id,
        capacity: match.capacity,
        openSlots: match.openSlots,
        feePerSlot: match.feePerSlot,
        skillMin: match.skillMin,
        skillMax: match.skillMax,
        discipline: match.discipline,
        mode: match.mode,
        startAt: match.startAt,
        endAt: match.endAt,
        court: match.court,
        venue: match.venue,
      },
    };
  });
}
