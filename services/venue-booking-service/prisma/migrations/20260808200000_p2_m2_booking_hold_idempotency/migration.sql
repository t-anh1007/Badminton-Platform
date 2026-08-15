-- P2-M2: one physical hold can create at most one marketplace booking.
ALTER TABLE "bookings" ADD COLUMN "holdId" TEXT;

CREATE UNIQUE INDEX "bookings_holdId_key" ON "bookings"("holdId");
