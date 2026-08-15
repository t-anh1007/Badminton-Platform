CREATE TABLE "finance"."quarantined_events" (
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "quarantinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quarantined_events_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX "quarantined_events_eventType_quarantinedAt_idx"
ON "finance"."quarantined_events"("eventType", "quarantinedAt");
