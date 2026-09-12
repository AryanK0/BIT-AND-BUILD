-- Stores the organizer's team grouping colour (for example, Pink or Orange).
-- It is optional because teams registered before this feature have no colour label.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS team_colour TEXT;

ALTER TABLE teams
  ADD CONSTRAINT teams_team_colour_length_check
  CHECK (team_colour IS NULL OR char_length(trim(team_colour)) BETWEEN 1 AND 40);
