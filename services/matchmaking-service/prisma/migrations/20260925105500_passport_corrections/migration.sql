-- CreateTable
CREATE TABLE "passport_corrections" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discipline" "MatchDiscipline" NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "approvedTier" "SkillTier" NOT NULL,
    "previousRating" DOUBLE PRECISION,
    "newRating" DOUBLE PRECISION NOT NULL,
    "matchesPlayed" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "passport_corrections_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "passport_corrections_ticketId_key" ON "passport_corrections"("ticketId");
-- CreateIndex
CREATE INDEX "passport_corrections_userId_discipline_idx" ON "passport_corrections"("userId", "discipline");
