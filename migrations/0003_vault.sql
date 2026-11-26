-- Konto: favourites and settings kept for a word only the user knows. The app turns the word into two keys on the phone
-- (PBKDF2): one finds the row, the other encrypts the data (AES-GCM). The server never sees the word or the plain data,
-- and stores only a SHA-256 of the finding key.
CREATE TABLE vault (
  k TEXT PRIMARY KEY,        -- sha256 of the id the app derived from the word
  data TEXT NOT NULL,        -- base64(iv + AES-GCM ciphertext), made on the phone
  at INTEGER NOT NULL,       -- last change (ms), set by the app
  created INTEGER NOT NULL
);
-- tries per network and 10-minute window (hashed with a salt in kv; rows older than a day are deleted by the cron)
CREATE TABLE tries (h TEXT NOT NULL, win INTEGER NOT NULL, op TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (h, win, op));
