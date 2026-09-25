-- AlterTable
ALTER TABLE "passports" ADD COLUMN     "lastAgedAt" TIMESTAMPTZ(3);
-- CreateTable
CREATE TABLE "match_rating_changes" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discipline" "MatchDiscipline" NOT NULL,
    "ratingBefore" DOUBLE PRECISION NOT NULL,
    "ratingAfter" DOUBLE PRECISION NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "match_rating_changes_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "rated_encounters" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discipline" "MatchDiscipline" NOT NULL,
    "opponentKey" TEXT NOT NULL,
    "finalizedAt" TIMESTAMPTZ(3) NOT NULL,
    "rated" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rated_encounters_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "match_rating_changes_userId_discipline_createdAt_idx" ON "match_rating_changes"("userId", "discipline", "createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "match_rating_changes_matchId_userId_discipline_key" ON "match_rating_changes"("matchId", "userId", "discipline");
-- CreateIndex
CREATE INDEX "rated_encounters_userId_discipline_opponentKey_finalizedAt_idx" ON "rated_encounters"("userId", "discipline", "opponentKey", "finalizedAt");
-- CreateIndex
CREATE UNIQUE INDEX "rated_encounters_matchId_userId_key" ON "rated_encounters"("matchId", "userId");
