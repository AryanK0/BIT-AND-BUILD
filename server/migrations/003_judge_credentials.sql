-- Persist the one-time Judge credential so it survives application restarts.
CREATE TABLE judge_credentials (
  judge_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL CHECK (char_length(password_hash) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
