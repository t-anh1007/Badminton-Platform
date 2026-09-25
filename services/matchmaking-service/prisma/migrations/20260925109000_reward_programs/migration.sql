-- CreateEnum
CREATE TYPE "RewardCriterion" AS ENUM ('ending_rating', 'most_wins', 'largest_rating_gain', 'longest_streak');
-- CreateEnum
CREATE TYPE "RewardProgramStatus" AS ENUM ('draft', 'scheduled', 'active', 'reconciling', 'awaiting_admin_approval', 'final', 'cancelled');
-- AlterTable
ALTER TABLE "match_rating_changes" ADD COLUMN     "won" BOOLEAN NOT NULL DEFAULT false;
-- CreateTable
CREATE TABLE "reward_programs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "criterion" "RewardCriterion" NOT NULL,
    "discipline" "MatchDiscipline" NOT NULL,
    "band" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "provinceCode" TEXT,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "fundingSource" TEXT NOT NULL,
    "status" "RewardProgramStatus" NOT NULL DEFAULT 'draft',
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "finalizedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reward_programs_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "reward_tiers" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    CONSTRAINT "reward_tiers_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "reward_awards" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reward_awards_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "reward_programs_status_startAt_idx" ON "reward_programs"("status", "startAt");
-- CreateIndex
CREATE UNIQUE INDEX "reward_tiers_programId_rank_key" ON "reward_tiers"("programId", "rank");
-- CreateIndex
CREATE UNIQUE INDEX "reward_awards_programId_userId_key" ON "reward_awards"("programId", "userId");
-- AddForeignKey
ALTER TABLE "reward_tiers" ADD CONSTRAINT "reward_tiers_programId_fkey" FOREIGN KEY ("programId") REFERENCES "reward_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "reward_awards" ADD CONSTRAINT "reward_awards_programId_fkey" FOREIGN KEY ("programId") REFERENCES "reward_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
