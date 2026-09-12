CREATE TABLE "ticket_images" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ticket_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_images_ticketId_position_key" ON "ticket_images"("ticketId", "position");
CREATE UNIQUE INDEX "ticket_images_ticketId_objectKey_key" ON "ticket_images"("ticketId", "objectKey");
CREATE INDEX "ticket_images_ticketId_position_idx" ON "ticket_images"("ticketId", "position");

ALTER TABLE "ticket_images"
  ADD CONSTRAINT "ticket_images_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
