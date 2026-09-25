-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "player_season_profiles" (
    "seasonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provinceCode" TEXT NOT NULL,
    "lockedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "player_season_profiles_pkey" PRIMARY KEY ("seasonId","userId")
);
-- CreateTable
CREATE TABLE "season_stats" (
    "seasonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discipline" "MatchDiscipline" NOT NULL,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "provinceMatches" INTEGER NOT NULL DEFAULT 0,
    "currentWinStreak" INTEGER NOT NULL DEFAULT 0,
    "longestWinStreak" INTEGER NOT NULL DEFAULT 0,
    "ratingGain" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "season_stats_pkey" PRIMARY KEY ("seasonId","userId","discipline")
);
-- CreateIndex
CREATE INDEX "seasons_startAt_endAt_idx" ON "seasons"("startAt", "endAt");
-- CreateIndex
CREATE INDEX "season_stats_seasonId_discipline_matchesPlayed_idx" ON "season_stats"("seasonId", "discipline", "matchesPlayed");
-- AddForeignKey
ALTER TABLE "player_season_profiles" ADD CONSTRAINT "player_season_profiles_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "season_stats" ADD CONSTRAINT "season_stats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
