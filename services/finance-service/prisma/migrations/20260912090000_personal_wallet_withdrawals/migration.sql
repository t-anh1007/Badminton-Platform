ALTER TABLE "wallets"
  ADD COLUMN "withdrawable" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "withdrawal_requests"
  ADD COLUMN "walletType" "WalletType" NOT NULL DEFAULT 'business';

ALTER TABLE "withdrawal_requests"
  ADD CONSTRAINT "withdrawal_requests_walletType_check"
  CHECK ("walletType" IN ('personal', 'business'));
