CREATE TYPE "ShutdownScopeType" AS ENUM ('venue', 'court');
CREATE TYPE "ShutdownMode" AS ENUM ('winding_down', 'scheduled_close', 'emergency');
CREATE TYPE "ShutdownOperationalStatus" AS ENUM ('winding_down', 'scheduled_close', 'inactive');
CREATE TYPE "ShutdownResolutionStatus" AS ENUM ('not_required', 'processing', 'completed', 'needs_attention');
CREATE TYPE "ShutdownItemStatus" AS ENUM ('identified', 'cancellation_processing', 'cancelled_refund_processing', 'refunded', 'cancelled_no_platform_refund', 'cancelled_unpaid', 'needs_attention');
CREATE TYPE "ShutdownRefundPath" AS ENUM ('booking', 'match', 'none');

ALTER TABLE "holds" ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Pre-migration holds are existing commitments if a shutdown begins immediately after deployment.
UPDATE "holds" SET "createdAt" = '1970-01-01T00:00:00Z';
ALTER TABLE "bookings" ADD COLUMN "holdPurposeSnapshot" "HoldPurpose" NOT NULL DEFAULT 'checkout';
UPDATE "bookings" AS booking
SET "holdPurposeSnapshot" = hold."purpose"
FROM "holds" AS hold
WHERE booking."holdId" = hold."id" AND hold."purpose" = 'match';

CREATE TABLE "operational_shutdowns" (
  "id" TEXT NOT NULL,
  "scopeType" "ShutdownScopeType" NOT NULL,
  "scopeId" TEXT NOT NULL,
  "mode" "ShutdownMode" NOT NULL,
  "modeStartedAt" TIMESTAMPTZ(3) NOT NULL,
  "operationalStatus" "ShutdownOperationalStatus" NOT NULL,
  "resolutionStatus" "ShutdownResolutionStatus" NOT NULL DEFAULT 'not_required',
  "effectiveAt" TIMESTAMPTZ(3),
  "expectedInactiveAt" TIMESTAMPTZ(3),
  "reason" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "originallyActiveCourtIds" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMPTZ(3),
  "endedByUserId" TEXT,
  CONSTRAINT "operational_shutdowns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "operational_shutdowns_scopeType_scopeId_endedAt_idx" ON "operational_shutdowns"("scopeType", "scopeId", "endedAt");
CREATE UNIQUE INDEX "operational_shutdowns_one_current_scope" ON "operational_shutdowns"("scopeType", "scopeId") WHERE "endedAt" IS NULL;

CREATE TABLE "operational_shutdown_items" (
  "id" TEXT NOT NULL,
  "shutdownId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "mode" "ShutdownMode" NOT NULL,
  "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
  "status" "ShutdownItemStatus" NOT NULL DEFAULT 'identified',
  "refundPath" "ShutdownRefundPath",
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operational_shutdown_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "operational_shutdown_items_shutdownId_bookingId_key" ON "operational_shutdown_items"("shutdownId", "bookingId");
CREATE INDEX "operational_shutdown_items_status_nextAttemptAt_idx" ON "operational_shutdown_items"("status", "nextAttemptAt");
ALTER TABLE "operational_shutdown_items" ADD CONSTRAINT "operational_shutdown_items_shutdownId_fkey" FOREIGN KEY ("shutdownId") REFERENCES "operational_shutdowns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_shutdown_items" ADD CONSTRAINT "operational_shutdown_items_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "operational_shutdown_transitions" (
  "id" TEXT NOT NULL,
  "shutdownId" TEXT NOT NULL,
  "fromMode" "ShutdownMode",
  "toMode" "ShutdownMode" NOT NULL,
  "previousEffectiveAt" TIMESTAMPTZ(3),
  "effectiveAt" TIMESTAMPTZ(3),
  "newlyAffectedCount" INTEGER NOT NULL,
  "estimatedRefundGross" BIGINT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operational_shutdown_transitions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "operational_shutdown_transitions_shutdownId_createdAt_idx" ON "operational_shutdown_transitions"("shutdownId", "createdAt");
ALTER TABLE "operational_shutdown_transitions" ADD CONSTRAINT "operational_shutdown_transitions_shutdownId_fkey" FOREIGN KEY ("shutdownId") REFERENCES "operational_shutdowns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
