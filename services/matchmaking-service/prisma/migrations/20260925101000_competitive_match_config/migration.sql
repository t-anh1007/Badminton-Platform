-- Kèo cạnh tranh v2: cấu hình kèo, snapshot booking và đội. Cột snapshot nullable cho kèo cũ.
CREATE TYPE "MatchSourceType" AS ENUM ('hold', 'paid_booking');
CREATE TYPE "MatchMode" AS ENUM ('friendly', 'ranked');
CREATE TYPE "MatchDiscipline" AS ENUM ('singles', 'doubles');
CREATE TYPE "MatchRatio" AS ENUM ('five_five', 'six_four', 'seven_three');
CREATE TYPE "MatchFormat" AS ENUM ('bo3', 'bo5');
CREATE TYPE "TeamSide" AS ENUM ('A', 'B');

ALTER TABLE "matches"
  ADD COLUMN "sourceType" "MatchSourceType" NOT NULL DEFAULT 'hold',
  ADD COLUMN "mode" "MatchMode" NOT NULL DEFAULT 'friendly',
  ADD COLUMN "discipline" "MatchDiscipline" NOT NULL DEFAULT 'singles',
  ADD COLUMN "ratio" "MatchRatio" NOT NULL DEFAULT 'five_five',
  ADD COLUMN "format" "MatchFormat" NOT NULL DEFAULT 'bo3',
  ADD COLUMN "bookingPrice" BIGINT,
  ADD COLUMN "startAt" TIMESTAMPTZ(3),
  ADD COLUMN "endAt" TIMESTAMPTZ(3),
  ADD COLUMN "venueId" TEXT,
  ADD COLUMN "provinceCode" TEXT,
  ADD COLUMN "providerUserId" TEXT;

ALTER TABLE "joins" ADD COLUMN "teamSide" "TeamSide";

CREATE INDEX "matches_mode_discipline_status_startAt_idx" ON "matches"("mode", "discipline", "status", "startAt");
CREATE INDEX "matches_provinceCode_mode_discipline_idx" ON "matches"("provinceCode", "mode", "discipline");
CREATE INDEX "joins_matchId_teamSide_status_idx" ON "joins"("matchId", "teamSide", "status");
