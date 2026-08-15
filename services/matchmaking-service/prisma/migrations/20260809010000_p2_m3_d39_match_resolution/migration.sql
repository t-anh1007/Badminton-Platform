-- D39: persist the fencing attempt and user action before the venue command.
ALTER TABLE "matches"
  ADD COLUMN "settlementAttemptId" TEXT,
  ADD COLUMN "settlementVenueRevision" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "matches_settlementAttemptId_key" ON "matches"("settlementAttemptId");

CREATE TYPE "MatchResolutionAction" AS ENUM ('withdraw', 'cancel');
CREATE TYPE "MatchResolutionDecision" AS ENUM ('pending', 'confirmed', 'held_revoked', 'cancelled');

CREATE TABLE "match_resolutions" (
  "commandId" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "joinId" TEXT,
  "action" "MatchResolutionAction" NOT NULL,
  "cancelReason" TEXT,
  "attemptId" TEXT,
  "venueRevision" INTEGER NOT NULL,
  "decision" "MatchResolutionDecision" NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),
  CONSTRAINT "match_resolutions_pkey" PRIMARY KEY ("commandId"),
  CONSTRAINT "match_resolutions_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "match_resolutions_matchId_action_decision_idx"
  ON "match_resolutions"("matchId", "action", "decision");
