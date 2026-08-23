-- PLAN_MATCH-DEPOSIT: trạng thái chờ trả cọc + hạn tìm đối X.
-- AlterEnum
ALTER TYPE "MatchStatus" ADD VALUE 'awaiting_deposit';
-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "deadlineAt" TIMESTAMPTZ(3);
