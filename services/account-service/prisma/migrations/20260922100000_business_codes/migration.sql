-- Add display references only. UUID keys and financial/security references remain unchanged.
-- Sequence defaults also backfill existing records. Never reset these sequences.
BEGIN;
CREATE SEQUENCE "users_business_code_seq" AS bigint MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE "users" ADD COLUMN "businessCode" TEXT NOT NULL DEFAULT ('ND-'::text || lpad((nextval('users_business_code_seq'::regclass))::text, 8, '0'::text));
ALTER SEQUENCE "users_business_code_seq" OWNED BY "users"."businessCode";
ALTER TABLE "users" ADD CONSTRAINT "users_businessCode_format" CHECK ("businessCode" ~ '^ND-[0-9]{8}$');
CREATE UNIQUE INDEX "users_businessCode_key" ON "users"("businessCode");
COMMIT;
