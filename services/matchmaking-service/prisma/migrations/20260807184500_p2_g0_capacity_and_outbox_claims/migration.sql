-- A lease makes Outbox claiming atomic across relay processes. If a process
-- crashes before publishing, another relay may reclaim the row after 30s.
ALTER TABLE "outbox" ADD COLUMN "claimedAt" TIMESTAMPTZ(3);
DROP INDEX "outbox_publishedAt_createdAt_idx";
CREATE INDEX "outbox_publishedAt_claimedAt_createdAt_idx"
  ON "outbox"("publishedAt", "claimedAt", "createdAt");

-- A player cannot evaluate themselves, even if an API guard regresses.
ALTER TABLE "evaluations"
  ADD CONSTRAINT "evaluations_no_self_rating" CHECK ("raterUserId" <> "rateeUserId");

-- Serialize every transition to confirmed on the parent match row, then count
-- confirmed participants. The organizer always consumes one capacity slot.
CREATE FUNCTION "matchmaking"."enforce_join_capacity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  match_capacity integer;
  confirmed_participants integer;
BEGIN
  IF NEW."status" <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT "capacity" INTO match_capacity
  FROM "matchmaking"."matches"
  WHERE "id" = NEW."matchId"
  FOR UPDATE;

  IF match_capacity IS NULL THEN
    RAISE EXCEPTION 'match % does not exist', NEW."matchId";
  END IF;

  SELECT count(*) INTO confirmed_participants
  FROM "matchmaking"."joins"
  WHERE "matchId" = NEW."matchId"
    AND "status" = 'confirmed'
    AND "id" <> NEW."id";

  IF confirmed_participants + 2 > match_capacity THEN
    RAISE EXCEPTION 'match % capacity exceeded', NEW."matchId"
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "joins_enforce_capacity"
BEFORE INSERT OR UPDATE OF "status", "matchId" ON "joins"
FOR EACH ROW EXECUTE FUNCTION "matchmaking"."enforce_join_capacity"();

CREATE FUNCTION "matchmaking"."enforce_match_capacity_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  confirmed_participants integer;
BEGIN
  SELECT count(*) INTO confirmed_participants
  FROM "matchmaking"."joins"
  WHERE "matchId" = NEW."id" AND "status" = 'confirmed';

  IF confirmed_participants + 1 > NEW."capacity" THEN
    RAISE EXCEPTION 'match % capacity below occupied slots', NEW."id"
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "matches_enforce_capacity_update"
BEFORE UPDATE OF "capacity" ON "matches"
FOR EACH ROW EXECUTE FUNCTION "matchmaking"."enforce_match_capacity_update"();
