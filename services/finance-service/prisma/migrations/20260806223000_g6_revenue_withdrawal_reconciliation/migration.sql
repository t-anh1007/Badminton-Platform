ALTER TABLE "withdrawal_requests"
  ADD COLUMN "transferCode" TEXT,
  ADD COLUMN "bankCode" TEXT,
  ADD COLUMN "bankAccountNumber" TEXT,
  ADD COLUMN "bankAccountName" TEXT,
  ADD COLUMN "rejectionReason" TEXT;

UPDATE "withdrawal_requests"
SET "transferCode" = 'LEGACY-' || "id",
    "bankCode" = 'LEGACY',
    "bankAccountNumber" = 'LEGACY',
    "bankAccountName" = 'LEGACY'
WHERE "transferCode" IS NULL;

ALTER TABLE "withdrawal_requests"
  ALTER COLUMN "transferCode" SET NOT NULL,
  ALTER COLUMN "bankCode" SET NOT NULL,
  ALTER COLUMN "bankAccountNumber" SET NOT NULL,
  ALTER COLUMN "bankAccountName" SET NOT NULL;

CREATE UNIQUE INDEX "withdrawal_requests_transferCode_key" ON "withdrawal_requests"("transferCode");

CREATE TABLE "booking_revenues" (
  "bookingId" TEXT NOT NULL,
  "businessWalletId" TEXT NOT NULL,
  "businessUserId" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "gross" BIGINT NOT NULL,
  "net" BIGINT NOT NULL,
  "commission" BIGINT NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "releaseAt" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_revenues_pkey" PRIMARY KEY ("bookingId"),
  CONSTRAINT "booking_revenues_businessWalletId_fkey" FOREIGN KEY ("businessWalletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "booking_revenues_businessUserId_releaseAt_idx" ON "booking_revenues"("businessUserId", "releaseAt");

CREATE TABLE "sepay_allocations" (
  "id" TEXT NOT NULL,
  "sepayEventId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "refId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sepay_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sepay_allocations_sepayEventId_fkey" FOREIGN KEY ("sepayEventId") REFERENCES "sepay_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "sepay_allocations_sepayEventId_idx" ON "sepay_allocations"("sepayEventId");

CREATE TABLE "finance_audits" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "refType" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_audits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "finance_audits_refType_refId_idx" ON "finance_audits"("refType", "refId");
