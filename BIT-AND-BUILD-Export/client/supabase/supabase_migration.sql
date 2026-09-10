-- ============================================
-- BIT & BUILD Hackathon — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TEAMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS teams (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  team_name TEXT NOT NULL,
  leader_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  leader_email TEXT NOT NULL,
  leader_name TEXT NOT NULL,
  college TEXT,
  project_title TEXT,
  project_description TEXT,
  tech_stack TEXT,
  github_link TEXT,
  demo_link TEXT,
  submission_status TEXT DEFAULT 'not_submitted' CHECK (submission_status IN ('not_submitted', 'submitted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ORGANIZER-ISSUED TEAM CREDENTIALS
-- ============================================
CREATE TABLE IF NOT EXISTS team_credentials (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  team_id UUID NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  login_name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Passwords are hashed inside Postgres and hashes are never returned to the client.
CREATE OR REPLACE FUNCTION create_organizer_team(
  p_team_name TEXT,
  p_leader_email TEXT,
  p_leader_name TEXT,
  p_college TEXT,
  p_login_name TEXT,
  p_password TEXT
)
RETURNS SETOF teams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_team teams;
BEGIN
  INSERT INTO teams (team_name, leader_id, leader_email, leader_name, college)
  VALUES (p_team_name, NULL, p_leader_email, p_leader_name, p_college)
  RETURNING * INTO new_team;

  INSERT INTO team_credentials (team_id, login_name, password_hash)
  VALUES (new_team.id, lower(trim(p_login_name)), crypt(p_password, gen_salt('bf')));

  RETURN NEXT new_team;
END;
$$;

CREATE OR REPLACE FUNCTION authenticate_team(p_login_name TEXT, p_password TEXT)
RETURNS TABLE (
  id UUID, team_name TEXT, leader_id UUID, leader_email TEXT, leader_name TEXT, college TEXT,
  project_title TEXT, project_description TEXT, tech_stack TEXT, github_link TEXT, demo_link TEXT,
  submission_status TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, login_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.team_name, t.leader_id, t.leader_email, t.leader_name, t.college,
    t.project_title, t.project_description, t.tech_stack, t.github_link, t.demo_link,
    t.submission_status, t.created_at, t.updated_at, c.login_name
  FROM teams t
  JOIN team_credentials c ON c.team_id = t.id
  WHERE c.login_name = lower(trim(p_login_name))
    AND c.password_hash = crypt(p_password, c.password_hash);
$$;

GRANT EXECUTE ON FUNCTION create_organizer_team(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION authenticate_team(TEXT, TEXT) TO anon, authenticated;

-- ============================================
-- TEAM MEMBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS team_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  member_email TEXT,
  member_role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SCORES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS scores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  judge_email TEXT NOT NULL,
  innovation INT DEFAULT 0 CHECK (innovation >= 0 AND innovation <= 10),
  technical INT DEFAULT 0 CHECK (technical >= 0 AND technical <= 10),
  design INT DEFAULT 0 CHECK (design >= 0 AND design <= 10),
  presentation INT DEFAULT 0 CHECK (presentation >= 0 AND presentation <= 10),
  completeness INT DEFAULT 0 CHECK (completeness >= 0 AND completeness <= 10),
  technical_execution INT DEFAULT 0 CHECK (technical_execution >= 0 AND technical_execution <= 10),
  innovation_creativity INT DEFAULT 0 CHECK (innovation_creativity >= 0 AND innovation_creativity <= 10),
  applicability_scalability INT DEFAULT 0 CHECK (applicability_scalability >= 0 AND applicability_scalability <= 10),
  ui_ux INT DEFAULT 0 CHECK (ui_ux >= 0 AND ui_ux <= 10),
  bonus_features INT DEFAULT 0 CHECK (bonus_features >= 0 AND bonus_features <= 10),
  work_distribution INT DEFAULT 0 CHECK (work_distribution >= 0 AND work_distribution <= 10),
  weighted_scores JSONB DEFAULT '{}'::jsonb,
  final_score NUMERIC(5, 1) DEFAULT 0 CHECK (final_score >= 0 AND final_score <= 100),
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, judge_email)
);

-- Keep an existing scores table compatible with the weighted rubric.
ALTER TABLE scores ADD COLUMN IF NOT EXISTS completeness INT DEFAULT 0 CHECK (completeness >= 0 AND completeness <= 10);
ALTER TABLE scores ADD COLUMN IF NOT EXISTS technical_execution INT DEFAULT 0 CHECK (technical_execution >= 0 AND technical_execution <= 10);
ALTER TABLE scores ADD COLUMN IF NOT EXISTS innovation_creativity INT DEFAULT 0 CHECK (innovation_creativity >= 0 AND innovation_creativity <= 10);
ALTER TABLE scores ADD COLUMN IF NOT EXISTS applicability_scalability INT DEFAULT 0 CHECK (applicability_scalability >= 0 AND applicability_scalability <= 10);
ALTER TABLE scores ADD COLUMN IF NOT EXISTS ui_ux INT DEFAULT 0 CHECK (ui_ux >= 0 AND ui_ux <= 10);
ALTER TABLE scores ADD COLUMN IF NOT EXISTS bonus_features INT DEFAULT 0 CHECK (bonus_features >= 0 AND bonus_features <= 10);
ALTER TABLE scores ADD COLUMN IF NOT EXISTS work_distribution INT DEFAULT 0 CHECK (work_distribution >= 0 AND work_distribution <= 10);
ALTER TABLE scores ADD COLUMN IF NOT EXISTS weighted_scores JSONB DEFAULT '{}'::jsonb;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS final_score NUMERIC(5, 1) DEFAULT 0 CHECK (final_score >= 0 AND final_score <= 100);

-- ============================================
-- ANNOUNCEMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS announcements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_credentials ENABLE ROW LEVEL SECURITY;

-- Teams: authenticated users can read all, but only modify their own
CREATE POLICY "Anyone can read teams" ON teams FOR SELECT USING (true);
CREATE POLICY "Organizer function creates teams" ON teams FOR INSERT WITH CHECK (true);
CREATE POLICY "Team workspace can update registered teams" ON teams FOR UPDATE USING (true);

-- Team members: readable by all, modifiable by team leader
CREATE POLICY "Anyone can read team_members" ON team_members FOR SELECT USING (true);
CREATE POLICY "Team leaders can manage members" ON team_members FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM teams WHERE teams.id = team_members.team_id AND teams.leader_id = auth.uid()));
CREATE POLICY "Team leaders can delete members" ON team_members FOR DELETE
  USING (EXISTS (SELECT 1 FROM teams WHERE teams.id = team_members.team_id AND teams.leader_id = auth.uid()));
CREATE POLICY "Issued team accounts can manage members" ON team_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Issued team accounts can remove members" ON team_members FOR DELETE USING (true);

-- Scores: readable by all, writable by anyone (judges use hardcoded auth)
CREATE POLICY "Anyone can read scores" ON scores FOR SELECT USING (true);
CREATE POLICY "Anyone can insert scores" ON scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update scores" ON scores FOR UPDATE USING (true);

-- Announcements: readable by all, writable by anyone (organizers use hardcoded auth)
CREATE POLICY "Anyone can read announcements" ON announcements FOR SELECT USING (true);
CREATE POLICY "Anyone can insert announcements" ON announcements FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete announcements" ON announcements FOR DELETE USING (true);

-- Credentials are accessed only through the RPC functions above.
-- No direct SELECT policy is granted on this table.

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_teams_leader_id ON teams(leader_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_scores_team_id ON scores(team_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
