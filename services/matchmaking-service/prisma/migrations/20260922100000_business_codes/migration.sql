-- Add display references only. UUID keys and financial/security references remain unchanged.
-- Sequence defaults also backfill existing records. Never reset these sequences.
BEGIN;
CREATE SEQUENCE "matches_business_code_seq" AS bigint MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE "matches" ADD COLUMN "businessCode" TEXT NOT NULL DEFAULT ('KEO-'::text || lpad((nextval('matches_business_code_seq'::regclass))::text, 8, '0'::text));
ALTER SEQUENCE "matches_business_code_seq" OWNED BY "matches"."businessCode";
ALTER TABLE "matches" ADD CONSTRAINT "matches_businessCode_format" CHECK ("businessCode" ~ '^KEO-[0-9]{8}$');
CREATE UNIQUE INDEX "matches_businessCode_key" ON "matches"("businessCode");
COMMIT;
