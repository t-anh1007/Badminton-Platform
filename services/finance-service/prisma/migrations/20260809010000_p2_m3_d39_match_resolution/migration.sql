-- D39: finance records the fenced attempt but leaves all funds reserved while
-- the venue's durable MatchBookingResolved decision is pending.
ALTER TYPE "MatchFundingStatus" ADD VALUE IF NOT EXISTS 'settling';

ALTER TABLE "match_fundings"
  ADD COLUMN "settlementAttemptId" TEXT,
  ADD COLUMN "settlementVenueRevision" INTEGER NOT NULL DEFAULT 0;
