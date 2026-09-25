-- AlterTable
ALTER TABLE "rated_encounters" ADD COLUMN     "opponentRating" DOUBLE PRECISION,
ADD COLUMN     "opponentRd" DOUBLE PRECISION,
ADD COLUMN     "score" DOUBLE PRECISION;
-- AlterTable
ALTER TABLE "season_stats" ADD COLUMN     "finalRating" DOUBLE PRECISION,
ADD COLUMN     "finalRd" DOUBLE PRECISION;
