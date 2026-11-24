-- the trip's rides after the reminder, so the cron can warn when a transfer is about to be missed (JSON, '' = one ride)
ALTER TABLE reminders ADD COLUMN legs TEXT NOT NULL DEFAULT '';
