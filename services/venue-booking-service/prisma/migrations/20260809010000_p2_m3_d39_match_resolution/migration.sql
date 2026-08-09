-- D39: venue owns the atomic settlement/revocation fence for a match booking.
ALTER TABLE "bookings"
  ADD COLUMN "matchSettlementRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "matchSettlementAttemptId" TEXT;

CREATE TYPE "MatchBookingCommandAction" AS ENUM ('settle', 'withdraw', 'cancel');
CREATE TYPE "MatchBookingCommandDecision" AS ENUM ('confirmed', 'held_revoked', 'cancelled');

CREATE TABLE "match_booking_commands" (
  "commandId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "attemptId" TEXT,
  "action" "MatchBookingCommandAction" NOT NULL,
  "expectedVenueRevision" INTEGER NOT NULL,
  "decision" "MatchBookingCommandDecision" NOT NULL,
  "winningAttemptId" TEXT,
  "venueRevision" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_booking_commands_pkey" PRIMARY KEY ("commandId"),
  CONSTRAINT "match_booking_commands_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "match_booking_commands_bookingId_createdAt_idx"
  ON "match_booking_commands"("bookingId", "createdAt");
