-- Multiple persistent Judge accounts.  The prior single-credential table is
-- retained for migration compatibility but is no longer used by the API.
CREATE SEQUENCE judge_public_id_seq START WITH 1;

CREATE TABLE judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  judge_id TEXT NOT NULL UNIQUE CHECK (judge_id ~ '^JUDGE-[0-9]{3,}$'),
  password_hash TEXT,
  credential_status TEXT NOT NULL DEFAULT 'none'
    CHECK (credential_status IN ('none', 'pending', 'consumed')),
  credential_issued_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX judges_credential_status_idx ON judges (credential_status);
CREATE INDEX scores_judge_team_idx ON scores (judge_id, team_id);
