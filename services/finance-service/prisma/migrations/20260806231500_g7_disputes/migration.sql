ALTER TABLE "disputes"
  ADD COLUMN "reason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "resolutionAmount" BIGINT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "disputes_bookingId_key" ON "disputes"("bookingId");
