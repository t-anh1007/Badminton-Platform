-- PLAN_MATCH-DEPOSIT: phân biệt hold checkout (BOK-06) với match-hold giữ slot tìm đối.
-- CreateEnum
CREATE TYPE "HoldPurpose" AS ENUM ('checkout', 'match');
-- AlterTable
ALTER TABLE "holds" ADD COLUMN     "purpose" "HoldPurpose" NOT NULL DEFAULT 'checkout';
