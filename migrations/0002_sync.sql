-- Rows that travel between someone's devices. The server never looks inside
-- `data`: it stores what it is given, in the order it arrives, and hands back
-- whatever is newer than a device has seen.
CREATE TABLE IF NOT EXISTS items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  uid        TEXT NOT NULL,
  -- When the device that wrote it says it last changed.
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  data       TEXT,
  -- The account's own running count, which is what a device asks for more than.
  seq        INTEGER NOT NULL,
  UNIQUE (user_id, kind, uid)
);

CREATE INDEX IF NOT EXISTS items_user_seq ON items (user_id, seq);

-- One running count per account, so a device can ask for "everything after 41".
CREATE TABLE IF NOT EXISTS sync_seq (
  user_id TEXT PRIMARY KEY,
  seq     INTEGER NOT NULL DEFAULT 0
);
