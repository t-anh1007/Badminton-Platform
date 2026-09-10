CREATE TYPE "NotificationCategory" AS ENUM ('booking', 'finance', 'match', 'dispute', 'support', 'security', 'community');
CREATE TYPE "NotificationPriority" AS ENUM ('action_required', 'update');

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "targetRole" "UserRole" NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "priority" "NotificationPriority" NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "actionKind" TEXT,
  "actionExpiresAt" TIMESTAMP(3),
  "sourceEventId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "notification_preferences" (
  "userId" TEXT NOT NULL,
  "targetRole" "UserRole" NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId", "targetRole", "category"),
  CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notifications_sourceEventId_userId_targetRole_key" ON "notifications"("sourceEventId", "userId", "targetRole");
CREATE INDEX "notifications_userId_createdAt_id_idx" ON "notifications"("userId", "createdAt" DESC, "id" DESC);
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt" DESC);
