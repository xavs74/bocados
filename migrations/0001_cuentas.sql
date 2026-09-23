-- Accounts. Only who someone is: no food, no days, no goals. Those stay on the
-- device until sync exists, and even then they get their own tables.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  seen_at TEXT NOT NULL
);

-- One row per way of signing in. Signing in with Google and later with an email
-- code lands on the same person, because both carry the same address.
CREATE TABLE IF NOT EXISTS identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, subject)
);

CREATE INDEX IF NOT EXISTS identities_user ON identities (user_id);
