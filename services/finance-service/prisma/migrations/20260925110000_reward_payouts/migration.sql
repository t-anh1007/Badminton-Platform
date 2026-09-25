-- CreateEnum
CREATE TYPE "RewardPayoutStatus" AS ENUM ('awaiting_information', 'ready_to_pay', 'paid', 'cancelled');
-- CreateTable
CREATE TABLE "reward_payouts" (
    "id" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "programName" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "claimDeadlineAt" TIMESTAMP(3) NOT NULL,
    "recipientName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "bankCode" TEXT,
    "bankAccountNumber" TEXT,
    "bankAccountName" TEXT,
    "informationSubmittedAt" TIMESTAMP(3),
    "payoutDeadlineAt" TIMESTAMP(3),
    "status" "RewardPayoutStatus" NOT NULL DEFAULT 'awaiting_information',
    "transactionReference" TEXT,
    "proofObjectKey" TEXT,
    "proofMimeType" TEXT,
    "proofSize" INTEGER,
    "proofChecksumSha256" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reward_payouts_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "reward_payouts_awardId_key" ON "reward_payouts"("awardId");
-- CreateIndex
CREATE UNIQUE INDEX "reward_payouts_transactionReference_key" ON "reward_payouts"("transactionReference");
-- CreateIndex
CREATE INDEX "reward_payouts_userId_createdAt_idx" ON "reward_payouts"("userId", "createdAt");
-- CreateIndex
CREATE INDEX "reward_payouts_status_claimDeadlineAt_idx" ON "reward_payouts"("status", "claimDeadlineAt");
-- CreateIndex
CREATE INDEX "reward_payouts_programId_idx" ON "reward_payouts"("programId");
