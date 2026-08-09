-- P2-M3 FIN-05: append-only match contribution funding aggregate.
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'reserve';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'settlement';

CREATE TYPE "MatchFundingStatus" AS ENUM ('collecting', 'settled', 'cancelled');
CREATE TYPE "MatchContributionRole" AS ENUM ('participant', 'organizer');
CREATE TYPE "MatchContributionStatus" AS ENUM ('pending', 'paid', 'settled', 'refunded');

CREATE TABLE "match_fundings" (
  "matchId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "organizerUserId" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "feePerSlot" BIGINT NOT NULL,
  "bookingPrice" BIGINT NOT NULL,
  "organizerContribution" BIGINT NOT NULL,
  "cutoffAt" TIMESTAMP(3) NOT NULL,
  "status" "MatchFundingStatus" NOT NULL DEFAULT 'collecting',
  "settledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_fundings_pkey" PRIMARY KEY ("matchId")
);

CREATE TABLE "match_contributions" (
  "id" TEXT NOT NULL,
  "contributionKey" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "joinId" TEXT,
  "userId" TEXT NOT NULL,
  "role" "MatchContributionRole" NOT NULL,
  "amount" BIGINT NOT NULL,
  "status" "MatchContributionStatus" NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3),
  "paymentMethod" "PaymentMethod",
  "paymentIntentId" TEXT,
  "paidAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_contributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "match_fundings_bookingId_key" ON "match_fundings"("bookingId");
CREATE UNIQUE INDEX "match_contributions_contributionKey_key" ON "match_contributions"("contributionKey");
CREATE UNIQUE INDEX "match_contributions_joinId_key" ON "match_contributions"("joinId");
CREATE INDEX "match_contributions_matchId_status_idx" ON "match_contributions"("matchId", "status");

ALTER TABLE "match_contributions"
  ADD CONSTRAINT "match_contributions_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "match_fundings"("matchId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "match_fundings"
  ADD CONSTRAINT "match_fundings_amounts_check"
  CHECK ("capacity" >= 2 AND "feePerSlot" >= 0 AND "bookingPrice" > 0 AND "organizerContribution" >= 0);

ALTER TABLE "match_contributions"
  ADD CONSTRAINT "match_contributions_amount_check" CHECK ("amount" >= 0);
