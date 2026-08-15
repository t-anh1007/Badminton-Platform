-- AlterEnum
ALTER TYPE "PaymentRefType" ADD VALUE 'topup';
-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN     "matchCode" TEXT;
-- AlterTable
ALTER TABLE "sepay_events" ADD COLUMN     "externalRef" TEXT;
-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "processed_events" (
    "eventId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("eventId")
);
-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_matchCode_key" ON "payment_intents"("matchCode");
-- CreateIndex
CREATE UNIQUE INDEX "sepay_events_externalRef_key" ON "sepay_events"("externalRef");
