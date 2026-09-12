-- PPT evaluation is intentionally independent from project submission scores.
CREATE TABLE presentation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  judge_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  comments TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT presentation_scores_one_per_team_judge UNIQUE (team_id, judge_id)
);

CREATE INDEX presentation_scores_judge_id_idx ON presentation_scores (judge_id);
