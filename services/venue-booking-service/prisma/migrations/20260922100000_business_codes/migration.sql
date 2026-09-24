-- Add display references only. UUID keys and financial/security references remain unchanged.
-- Sequence defaults also backfill existing records. Never reset these sequences.
BEGIN;
CREATE SEQUENCE "providers_business_code_seq" AS bigint MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE "providers" ADD COLUMN "businessCode" TEXT NOT NULL DEFAULT ('NCC-'::text || lpad((nextval('providers_business_code_seq'::regclass))::text, 8, '0'::text));
ALTER SEQUENCE "providers_business_code_seq" OWNED BY "providers"."businessCode";
ALTER TABLE "providers" ADD CONSTRAINT "providers_businessCode_format" CHECK ("businessCode" ~ '^NCC-[0-9]{8}$');
CREATE UNIQUE INDEX "providers_businessCode_key" ON "providers"("businessCode");
CREATE SEQUENCE "venues_business_code_seq" AS bigint MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE "venues" ADD COLUMN "businessCode" TEXT NOT NULL DEFAULT ('CS-'::text || lpad((nextval('venues_business_code_seq'::regclass))::text, 8, '0'::text));
ALTER SEQUENCE "venues_business_code_seq" OWNED BY "venues"."businessCode";
ALTER TABLE "venues" ADD CONSTRAINT "venues_businessCode_format" CHECK ("businessCode" ~ '^CS-[0-9]{8}$');
CREATE UNIQUE INDEX "venues_businessCode_key" ON "venues"("businessCode");
CREATE SEQUENCE "courts_business_code_seq" AS bigint MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE "courts" ADD COLUMN "businessCode" TEXT NOT NULL DEFAULT ('SAN-'::text || lpad((nextval('courts_business_code_seq'::regclass))::text, 8, '0'::text));
ALTER SEQUENCE "courts_business_code_seq" OWNED BY "courts"."businessCode";
ALTER TABLE "courts" ADD CONSTRAINT "courts_businessCode_format" CHECK ("businessCode" ~ '^SAN-[0-9]{8}$');
CREATE UNIQUE INDEX "courts_businessCode_key" ON "courts"("businessCode");
CREATE SEQUENCE "bookings_business_code_seq" AS bigint MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE "bookings" ADD COLUMN "businessCode" TEXT NOT NULL DEFAULT ('BK-'::text || lpad((nextval('bookings_business_code_seq'::regclass))::text, 8, '0'::text));
ALTER SEQUENCE "bookings_business_code_seq" OWNED BY "bookings"."businessCode";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_businessCode_format" CHECK ("businessCode" ~ '^BK-[0-9]{8}$');
CREATE UNIQUE INDEX "bookings_businessCode_key" ON "bookings"("businessCode");
COMMIT;
