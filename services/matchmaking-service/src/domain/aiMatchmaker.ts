import {
  calculateCompatibility,
  enrichMatchmakerSuggestions,
  type MatchmakerCandidate,
  type MatchmakerExplanationClient,
} from '@khoaluantn/ai';
import type { VenueBookingClient } from '../clients/venueBooking.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { findPublicMatches, type MatchSearchFilters } from './matches.js';
import { INITIAL_RD, TIER_CENTERS } from './rating.js';

export type AiMatchSearchFilters = Omit<MatchSearchFilters, 'skill'>;

export async function suggestAiMatches(
  venueBookingClient: VenueBookingClient,
  playerUserId: string,
  filters: AiMatchSearchFilters,
  matchmakerClient?: MatchmakerExplanationClient,
) {
  const passport = await prisma.passport.findUnique({ where: { userId: playerUserId } });
  if (!passport) {
    throw new AppError(409, 'PASSPORT_REQUIRED', 'Create a Passport before requesting match suggestions.');
  }

  const matches = (await findPublicMatches(venueBookingClient, { ...filters, skill: undefined }))
    .filter((match) => match.organizerUserId !== playerUserId);
  const entries = matches.map((match) => {
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
    const candidate: MatchmakerCandidate = {
      matchId: match.id,
      score: compatibility.score,
      fallbackExplanation: `Điểm F-02 ${compatibility.score}: ${compatibility.explanation}`,
      groundedReasons: [compatibility.explanation],
      publicDetails: {
        skillMin: match.skillMin,
        skillMax: match.skillMax,
        startAt: match.startAt,
        venueName: match.venue.name,
        courtName: match.court.name,
        feePerSlot: match.feePerSlot,
      },
    };
    return { match, candidate };
  }).sort((left, right) => right.candidate.score - left.candidate.score
    || left.match.startAt.localeCompare(right.match.startAt));

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
      match: {
        id: match.id,
        capacity: match.capacity,
        openSlots: match.openSlots,
        feePerSlot: match.feePerSlot,
        skillMin: match.skillMin,
        skillMax: match.skillMax,
        startAt: match.startAt,
        endAt: match.endAt,
        court: match.court,
        venue: match.venue,
      },
    };
  });
}
