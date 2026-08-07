-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('open', 'filled', 'confirmed', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "JoinStatus" AS ENUM ('pending', 'approved', 'rejected', 'confirmed', 'withdrawn');

-- CreateEnum
CREATE TYPE "SkillTier" AS ENUM ('newcomer', 'beginner', 'intermediate', 'intermediate_plus', 'advanced');

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "organizerUserId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "feePerSlot" BIGINT NOT NULL,
    "skillMin" "SkillTier",
    "skillMax" "SkillTier",
    "status" "MatchStatus" NOT NULL DEFAULT 'open',
    "cutoffAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "joins" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "participantUserId" TEXT NOT NULL,
    "status" "JoinStatus" NOT NULL DEFAULT 'pending',
    "feePaidAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "joins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passports" (
    "userId" TEXT NOT NULL,
    "declaredTier" "SkillTier",
    "ratingMu" DOUBLE PRECISION NOT NULL,
    "ratingRd" DOUBLE PRECISION NOT NULL,
    "ratingSigma" DOUBLE PRECISION NOT NULL,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "passports_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "raterUserId" TEXT NOT NULL,
    "rateeUserId" TEXT NOT NULL,
    "perceivedTier" "SkillTier",
    "labels" JSONB,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "countedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "eventId" TEXT NOT NULL,
    "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "matches_status_cutoffAt_idx" ON "matches"("status", "cutoffAt");

-- CreateIndex
CREATE INDEX "joins_matchId_status_idx" ON "joins"("matchId", "status");

-- CreateIndex
CREATE INDEX "evaluations_matchId_flagged_idx" ON "evaluations"("matchId", "flagged");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_matchId_raterUserId_rateeUserId_key" ON "evaluations"("matchId", "raterUserId", "rateeUserId");

-- CreateIndex
CREATE INDEX "outbox_publishedAt_createdAt_idx" ON "outbox"("publishedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "joins" ADD CONSTRAINT "joins_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
