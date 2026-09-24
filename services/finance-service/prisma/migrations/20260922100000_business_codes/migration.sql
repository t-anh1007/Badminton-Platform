-- Add display references only. UUID keys and financial/security references remain unchanged.
-- Sequence defaults also backfill existing records. Never reset these sequences.
BEGIN;
CREATE SEQUENCE "sepay_events_business_code_seq" AS bigint MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE "sepay_events" ADD COLUMN "businessCode" TEXT NOT NULL DEFAULT ('GD-'::text || lpad((nextval('sepay_events_business_code_seq'::regclass))::text, 8, '0'::text));
ALTER SEQUENCE "sepay_events_business_code_seq" OWNED BY "sepay_events"."businessCode";
ALTER TABLE "sepay_events" ADD CONSTRAINT "sepay_events_businessCode_format" CHECK ("businessCode" ~ '^GD-[0-9]{8}$');
CREATE UNIQUE INDEX "sepay_events_businessCode_key" ON "sepay_events"("businessCode");
CREATE SEQUENCE "disputes_business_code_seq" AS bigint MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE "disputes" ADD COLUMN "businessCode" TEXT NOT NULL DEFAULT ('KN-'::text || lpad((nextval('disputes_business_code_seq'::regclass))::text, 8, '0'::text));
ALTER SEQUENCE "disputes_business_code_seq" OWNED BY "disputes"."businessCode";
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_businessCode_format" CHECK ("businessCode" ~ '^KN-[0-9]{8}$');
CREATE UNIQUE INDEX "disputes_businessCode_key" ON "disputes"("businessCode");
COMMIT;
