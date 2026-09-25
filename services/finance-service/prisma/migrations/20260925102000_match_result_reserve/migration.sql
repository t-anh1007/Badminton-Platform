-- Kèo cạnh tranh v2: tách settlement booking khỏi phần tiền giữ chờ kết quả.
CREATE TYPE "MatchFundingSource" AS ENUM ('hold', 'paid_booking');
CREATE TYPE "ResultReserveStatus" AS ENUM ('none', 'locked', 'released', 'refunded');
CREATE TYPE "MatchContributionSource" AS ENUM ('cash', 'booking_payment');

ALTER TABLE "match_fundings"
  ADD COLUMN "sourceType" "MatchFundingSource" NOT NULL DEFAULT 'hold',
  ADD COLUMN "discipline" TEXT NOT NULL DEFAULT 'singles',
  ADD COLUMN "ratio" TEXT NOT NULL DEFAULT '5:5',
  ADD COLUMN "totalContribution" BIGINT,
  ADD COLUMN "resultReserve" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "resultReserveStatus" "ResultReserveStatus" NOT NULL DEFAULT 'none',
  ADD COLUMN "organizerRebalance" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "resultFinalizedAt" TIMESTAMP(3);

-- Funding cũ: tổng góp đúng bằng giá booking, không có phần giữ chờ kết quả.
UPDATE "match_fundings" SET "totalContribution" = "bookingPrice";
ALTER TABLE "match_fundings" ALTER COLUMN "totalContribution" SET NOT NULL;

ALTER TABLE "match_contributions"
  ADD COLUMN "teamSide" TEXT,
  ADD COLUMN "source" "MatchContributionSource" NOT NULL DEFAULT 'cash';
