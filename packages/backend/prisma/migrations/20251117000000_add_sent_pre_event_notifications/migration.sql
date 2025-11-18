-- CreateTable
CREATE TABLE "sent_pre_event_notifications" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sent_pre_event_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sent_pre_event_notifications_eventId_key" ON "sent_pre_event_notifications"("eventId");

-- AddForeignKey
ALTER TABLE "sent_pre_event_notifications" ADD CONSTRAINT "sent_pre_event_notifications_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
