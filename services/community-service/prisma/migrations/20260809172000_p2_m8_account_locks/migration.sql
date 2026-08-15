-- AccountLocked is consumed into Community's own schema; userId is an opaque
-- reference to account-service and deliberately has no cross-schema FK.
CREATE TABLE "account_locks" (
    "userId" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_locks_pkey" PRIMARY KEY ("userId")
);
