-- Initial persistent data model for the BIT & BUILD portal.
-- This file is executed transactionally and recorded by src/db/migrate.js.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name TEXT NOT NULL CHECK (char_length(trim(team_name)) > 0),
  leader_name TEXT NOT NULL CHECK (char_length(trim(leader_name)) > 0),
  leader_email TEXT NOT NULL CHECK (char_length(trim(leader_email)) > 0),
  college TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (char_length(trim(display_name)) > 0),
  role TEXT NOT NULL CHECK (role IN ('organizer', 'judge', 'participant')),
  password_hash TEXT NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_normalized_unique UNIQUE (email),
  CONSTRAINT participant_requires_team CHECK (role <> 'participant' OR team_id IS NOT NULL),
  CONSTRAINT non_participant_has_no_team CHECK (role = 'participant' OR team_id IS NULL)
);

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  email TEXT,
  role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE team_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  login_name TEXT NOT NULL UNIQUE CHECK (login_name = lower(trim(login_name))),
  password_hash TEXT NOT NULL CHECK (char_length(password_hash) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('organizer', 'judge', 'participant')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sessions_expires_after_creation CHECK (expires_at > created_at)
);

CREATE TABLE problem_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  problem_statement_id UUID REFERENCES problem_statements(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  tech_stack TEXT,
  github_url TEXT,
  demo_url TEXT,
  submission_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'withdrawn')),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT submitted_submission_has_timestamp CHECK (status <> 'submitted' OR submitted_at IS NOT NULL)
);

CREATE TABLE scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  judge_id UUID REFERENCES users(id) ON DELETE SET NULL,
  judge_email TEXT NOT NULL,
  -- Legacy fields retained for the existing INSERT statement in src/app.js.
  innovation INTEGER NOT NULL DEFAULT 0 CHECK (innovation BETWEEN 0 AND 10),
  technical INTEGER NOT NULL DEFAULT 0 CHECK (technical BETWEEN 0 AND 10),
  design INTEGER NOT NULL DEFAULT 0 CHECK (design BETWEEN 0 AND 10),
  presentation INTEGER NOT NULL DEFAULT 0 CHECK (presentation BETWEEN 0 AND 10),
  completeness INTEGER NOT NULL DEFAULT 0 CHECK (completeness BETWEEN 0 AND 10),
  technical_execution INTEGER NOT NULL DEFAULT 0 CHECK (technical_execution BETWEEN 0 AND 10),
  innovation_creativity INTEGER NOT NULL DEFAULT 0 CHECK (innovation_creativity BETWEEN 0 AND 10),
  applicability_scalability INTEGER NOT NULL DEFAULT 0 CHECK (applicability_scalability BETWEEN 0 AND 10),
  ui_ux INTEGER NOT NULL DEFAULT 0 CHECK (ui_ux BETWEEN 0 AND 10),
  bonus_features INTEGER NOT NULL DEFAULT 0 CHECK (bonus_features BETWEEN 0 AND 10),
  work_distribution INTEGER NOT NULL DEFAULT 0 CHECK (work_distribution BETWEEN 0 AND 10),
  weighted_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  final_score NUMERIC(5, 1) NOT NULL DEFAULT 0 CHECK (final_score BETWEEN 0 AND 100),
  comments TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scores_one_per_team_judge UNIQUE (team_id, judge_email)
);

CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX teams_leader_email_idx ON teams (leader_email);
CREATE INDEX users_team_id_idx ON users (team_id);
CREATE INDEX users_role_idx ON users (role);
CREATE INDEX team_members_team_id_idx ON team_members (team_id);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
CREATE INDEX submissions_problem_statement_id_idx ON submissions (problem_statement_id);
CREATE INDEX submissions_status_idx ON submissions (status);
CREATE INDEX scores_submission_id_idx ON scores (submission_id);
CREATE INDEX scores_judge_id_idx ON scores (judge_id);
CREATE INDEX announcements_active_created_at_idx ON announcements (is_active, created_at DESC);
