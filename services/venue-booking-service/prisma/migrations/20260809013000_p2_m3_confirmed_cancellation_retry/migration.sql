ALTER TABLE "bookings"
  ADD COLUMN "cancellationRefundPercent" INTEGER;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_cancellation_refund_percent_range"
  CHECK ("cancellationRefundPercent" IS NULL OR "cancellationRefundPercent" BETWEEN 0 AND 100);
