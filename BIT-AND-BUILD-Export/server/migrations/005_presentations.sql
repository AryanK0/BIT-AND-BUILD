CREATE TABLE presentations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL CHECK (char_length(trim(original_filename)) > 0),
  stored_filename TEXT NOT NULL UNIQUE CHECK (char_length(trim(stored_filename)) > 0),
  mime_type TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX presentations_team_id_idx ON presentations (team_id);
