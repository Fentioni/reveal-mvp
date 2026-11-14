-- Reveal Quest v1: additive migration; preserves existing reveals/payments.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS quest_configs (
  reveal_id TEXT PRIMARY KEY REFERENCES reveals(id) ON DELETE CASCADE,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quest_sessions (
  session_hash TEXT PRIMARY KEY,
  reveal_id TEXT NOT NULL REFERENCES reveals(id) ON DELETE CASCADE,
  step INTEGER NOT NULL DEFAULT 0 CHECK(step BETWEEN 0 AND 5),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_quest_sessions_reveal ON quest_sessions(reveal_id);
