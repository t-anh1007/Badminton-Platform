-- VEN-05c: khóa lịch theo khung giờ; một ngày có thể có nhiều khung khóa.
ALTER TABLE "closures" ADD COLUMN "startMinute" INTEGER, ADD COLUMN "endMinute" INTEGER;
DROP INDEX "closures_courtId_date_key";
CREATE INDEX "closures_courtId_date_idx" ON "closures"("courtId", "date");
