-- Add unique constraints to prevent duplicates

-- Add unique constraint on fighters (firstName, lastName)
CREATE UNIQUE INDEX "fighters_firstName_lastName_key" ON "fighters"("firstName", "lastName");

-- Add unique constraint on events (name, date)
CREATE UNIQUE INDEX "events_name_date_key" ON "events"("name", "date");

-- Add unique constraint on fights (eventId, fighter1Id, fighter2Id)
CREATE UNIQUE INDEX "fights_eventId_fighter1Id_fighter2Id_key" ON "fights"("eventId", "fighter1Id", "fighter2Id");
