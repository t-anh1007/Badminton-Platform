-- A lease makes Outbox claiming atomic across relay processes. If a process
-- crashes before publishing, another relay may reclaim the row after 30s.
ALTER TABLE "outbox" ADD COLUMN "claimedAt" TIMESTAMPTZ(3);
DROP INDEX "outbox_publishedAt_createdAt_idx";
CREATE INDEX "outbox_publishedAt_claimedAt_createdAt_idx"
  ON "outbox"("publishedAt", "claimedAt", "createdAt");
