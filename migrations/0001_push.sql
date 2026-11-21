-- "Mine 5 min pärast" reminders sent as Web Push, and the Worker's own VAPID key pair
CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  sub TEXT NOT NULL,          -- the browser's push subscription (JSON)
  ymd INTEGER NOT NULL,       -- service day, Tallinn time
  siri INTEGER NOT NULL DEFAULT 0, -- Tallinn stop id for live times (0 = timetable only)
  mode TEXT NOT NULL,
  route TEXT NOT NULL,
  sched REAL NOT NULL,        -- scheduled departure at the stop, minutes from midnight
  lead REAL NOT NULL,         -- minutes from leaving to that departure (the walk)
  delay REAL NOT NULL DEFAULT 0,
  stop TEXT NOT NULL,
  dest TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created INTEGER NOT NULL
);
CREATE INDEX reminders_status ON reminders(status);
CREATE INDEX reminders_endpoint ON reminders(endpoint);
