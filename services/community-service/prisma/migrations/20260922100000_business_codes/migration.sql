-- Add display references only. UUID keys and financial/security references remain unchanged.
-- Sequence defaults also backfill existing records. Never reset these sequences.
BEGIN;
CREATE SEQUENCE "posts_business_code_seq" AS bigint MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE "posts" ADD COLUMN "businessCode" TEXT NOT NULL DEFAULT ('BV-'::text || lpad((nextval('posts_business_code_seq'::regclass))::text, 8, '0'::text));
ALTER SEQUENCE "posts_business_code_seq" OWNED BY "posts"."businessCode";
ALTER TABLE "posts" ADD CONSTRAINT "posts_businessCode_format" CHECK ("businessCode" ~ '^BV-[0-9]{8}$');
CREATE UNIQUE INDEX "posts_businessCode_key" ON "posts"("businessCode");
CREATE SEQUENCE "comments_business_code_seq" AS bigint MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE "comments" ADD COLUMN "businessCode" TEXT NOT NULL DEFAULT ('BL-'::text || lpad((nextval('comments_business_code_seq'::regclass))::text, 8, '0'::text));
ALTER SEQUENCE "comments_business_code_seq" OWNED BY "comments"."businessCode";
ALTER TABLE "comments" ADD CONSTRAINT "comments_businessCode_format" CHECK ("businessCode" ~ '^BL-[0-9]{8}$');
CREATE UNIQUE INDEX "comments_businessCode_key" ON "comments"("businessCode");
CREATE SEQUENCE "reports_business_code_seq" AS bigint MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE "reports" ADD COLUMN "businessCode" TEXT NOT NULL DEFAULT ('BC-'::text || lpad((nextval('reports_business_code_seq'::regclass))::text, 8, '0'::text));
ALTER SEQUENCE "reports_business_code_seq" OWNED BY "reports"."businessCode";
ALTER TABLE "reports" ADD CONSTRAINT "reports_businessCode_format" CHECK ("businessCode" ~ '^BC-[0-9]{8}$');
CREATE UNIQUE INDEX "reports_businessCode_key" ON "reports"("businessCode");
CREATE SEQUENCE "tickets_business_code_seq" AS bigint MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE "tickets" ADD COLUMN "businessCode" TEXT NOT NULL DEFAULT ('HT-'::text || lpad((nextval('tickets_business_code_seq'::regclass))::text, 8, '0'::text));
ALTER SEQUENCE "tickets_business_code_seq" OWNED BY "tickets"."businessCode";
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_businessCode_format" CHECK ("businessCode" ~ '^HT-[0-9]{8}$');
CREATE UNIQUE INDEX "tickets_businessCode_key" ON "tickets"("businessCode");
COMMIT;
