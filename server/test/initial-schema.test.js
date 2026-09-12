import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(testDirectory, '../migrations/001_initial_schema.sql');
const migrationSql = await fs.readFile(migrationPath, 'utf8');

describe('001 initial schema', () => {
  test('creates every required portal table', () => {
    for (const table of [
      'teams', 'team_members', 'team_credentials', 'users', 'sessions',
      'problem_statements', 'submissions', 'scores', 'announcements',
    ]) {
      expect(migrationSql).toMatch(new RegExp(`CREATE TABLE ${table} \\(`));
    }
  });

  test('protects credentials and supports persistent hashed sessions', () => {
    expect(migrationSql).toMatch(/password_hash TEXT NOT NULL/);
    expect(migrationSql).toMatch(/token_hash TEXT NOT NULL UNIQUE/);
    expect(migrationSql).not.toMatch(/raw_token/i);
  });

  test('contains the exact eight weighted scoring criteria and current score uniqueness', () => {
    for (const criterion of [
      'completeness', 'technical_execution', 'innovation_creativity',
      'applicability_scalability', 'ui_ux', 'bonus_features', 'presentation',
      'work_distribution',
    ]) {
      expect(migrationSql).toMatch(new RegExp(`${criterion} INTEGER NOT NULL DEFAULT 0 CHECK \\(${criterion} BETWEEN 0 AND 10\\)`));
    }
    expect(migrationSql).toMatch(/CONSTRAINT scores_one_per_team_judge UNIQUE \(team_id, judge_email\)/);
  });

  test('does not introduce Supabase dependencies', () => {
    expect(migrationSql).not.toMatch(/supabase/i);
  });
});
