-- Keep PPT evaluations independent from both submissions and the PPT bytes.
-- The legacy single score remains for backwards-compatible historical rows.
ALTER TABLE presentation_scores
  ADD COLUMN completeness INTEGER NOT NULL DEFAULT 0 CHECK (completeness BETWEEN 0 AND 20),
  ADD COLUMN technical_execution INTEGER NOT NULL DEFAULT 0 CHECK (technical_execution BETWEEN 0 AND 20),
  ADD COLUMN innovation_creativity INTEGER NOT NULL DEFAULT 0 CHECK (innovation_creativity BETWEEN 0 AND 15),
  ADD COLUMN applicability_scalability INTEGER NOT NULL DEFAULT 0 CHECK (applicability_scalability BETWEEN 0 AND 15),
  ADD COLUMN ui_ux INTEGER NOT NULL DEFAULT 0 CHECK (ui_ux BETWEEN 0 AND 10),
  ADD COLUMN bonus_features INTEGER NOT NULL DEFAULT 0 CHECK (bonus_features BETWEEN 0 AND 10),
  ADD COLUMN presentation INTEGER NOT NULL DEFAULT 0 CHECK (presentation BETWEEN 0 AND 5),
  ADD COLUMN work_distribution INTEGER NOT NULL DEFAULT 0 CHECK (work_distribution BETWEEN 0 AND 5),
  ADD COLUMN weighted_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN final_score NUMERIC(5, 1) NOT NULL DEFAULT 0 CHECK (final_score BETWEEN 0 AND 100);
