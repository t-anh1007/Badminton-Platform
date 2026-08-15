-- P2-M3: idempotent contribution receipts and match-funding saga state.
ALTER TABLE "matches"
  ADD COLUMN "organizerContributionPaidAt" TIMESTAMPTZ(3),
  ADD COLUMN "organizerContributionId" TEXT,
  ADD COLUMN "fundingRequestedAt" TIMESTAMPTZ(3);

ALTER TABLE "joins" ADD COLUMN "paymentContributionId" TEXT;

CREATE UNIQUE INDEX "matches_organizerContributionId_key" ON "matches"("organizerContributionId");
CREATE UNIQUE INDEX "joins_paymentContributionId_key" ON "joins"("paymentContributionId");
