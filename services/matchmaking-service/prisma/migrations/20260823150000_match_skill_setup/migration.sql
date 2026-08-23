-- Existing matches stay discoverable; newly created matches require explicit setup.
ALTER TABLE "matches" ADD COLUMN "skillConfiguredAt" TIMESTAMPTZ(3);
UPDATE "matches" SET "skillConfiguredAt" = "createdAt";
