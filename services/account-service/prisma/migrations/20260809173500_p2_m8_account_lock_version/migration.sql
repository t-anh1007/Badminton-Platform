-- Monotonic per-account revision lets downstream AccountLocked projections
-- reject a delayed lock/unlock event without querying the account schema.
ALTER TABLE "users" ADD COLUMN "accountLockVersion" INTEGER NOT NULL DEFAULT 0;
