ALTER TABLE "notifications" ADD COLUMN "bookingBusinessCode" TEXT;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_bookingBusinessCode_format"
  CHECK ("bookingBusinessCode" IS NULL OR "bookingBusinessCode" ~ '^BK-[0-9]{8}$');
