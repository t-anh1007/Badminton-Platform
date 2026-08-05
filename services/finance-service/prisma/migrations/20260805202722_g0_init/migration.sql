-- CreateEnum
CREATE TYPE "WalletType" AS ENUM ('personal', 'business', 'platform');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('topup', 'payment', 'refund', 'payout', 'commission', 'release');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('balance', 'sepay');

-- CreateEnum
CREATE TYPE "PaymentRefType" AS ENUM ('booking', 'matchFee');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "SepayDirection" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "SepayStatus" AS ENUM ('unmatched', 'matched_auto', 'matched_manual', 'out_of_scope');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'paid', 'rejected', 'partially_paid');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'resolved');

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "walletType" "WalletType" NOT NULL,
    "available" BIGINT NOT NULL DEFAULT 0,
    "pending" BIGINT NOT NULL DEFAULT 0,
    "reserved" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "before" BIGINT NOT NULL,
    "after" BIGINT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "refType" "PaymentRefType" NOT NULL,
    "refId" TEXT NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sepay_events" (
    "id" TEXT NOT NULL,
    "direction" "SepayDirection" NOT NULL,
    "amount" BIGINT NOT NULL,
    "rawRef" TEXT NOT NULL,
    "matchedType" TEXT,
    "matchedId" TEXT,
    "status" "SepayStatus" NOT NULL DEFAULT 'unmatched',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sepay_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "paidAmount" BIGINT,
    "sePayEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "raiserUserId" TEXT NOT NULL,
    "evidence" JSONB,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "decidedByUserId" TEXT,
    "deadlineAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_walletType_key" ON "wallets"("userId", "walletType");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
