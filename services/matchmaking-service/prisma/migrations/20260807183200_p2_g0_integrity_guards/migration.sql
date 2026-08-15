-- BR-MMP-03/08: enforce the schema-level bounds before application logic exists.
ALTER TABLE "matches"
  ADD CONSTRAINT "matches_capacity_at_least_two" CHECK ("capacity" >= 2),
  ADD CONSTRAINT "matches_fee_nonnegative" CHECK ("feePerSlot" >= 0);

-- BR-MMP-04: a rejected or withdrawn request may be re-submitted, but an active
-- request for the same player/match is unique. Prisma has no partial-index DSL.
CREATE UNIQUE INDEX "joins_active_match_participant_key"
  ON "joins"("matchId", "participantUserId")
  WHERE "status" NOT IN ('rejected', 'withdrawn');
