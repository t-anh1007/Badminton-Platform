-- CreateTable
CREATE TABLE "player_badges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discipline" "MatchDiscipline" NOT NULL,
    "seasonId" TEXT NOT NULL,
    "badgeType" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "provinceCode" TEXT NOT NULL DEFAULT '',
    "awardedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "player_badges_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "player_badges_userId_awardedAt_idx" ON "player_badges"("userId", "awardedAt");
-- CreateIndex
CREATE UNIQUE INDEX "player_badges_userId_discipline_seasonId_badgeType_scope_pr_key" ON "player_badges"("userId", "discipline", "seasonId", "badgeType", "scope", "provinceCode");
-- AddForeignKey
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
