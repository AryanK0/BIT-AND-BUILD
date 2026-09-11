import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));
const appSource = await fs.readFile(path.resolve(directory, '../src/app.js'), 'utf8');
const migration = await fs.readFile(path.resolve(directory, '../migrations/003_judge_credentials.sql'), 'utf8');

describe('one-time judge password implementation', () => {
  test('persists only a hash and consumes the credential in a transaction', () => {
    expect(migration).toMatch(/password_hash TEXT NOT NULL/);
    expect(migration).not.toMatch(/password TEXT NOT NULL/);
    expect(appSource).toMatch(/INSERT INTO judge_credentials/);
    expect(appSource).toMatch(/FOR UPDATE/);
    expect(appSource).toMatch(/DELETE FROM judge_credentials/);
    expect(appSource).not.toMatch(/pendingJudgePasswordHash/);
  });

  test('keeps password generation restricted to organizers', () => {
    expect(appSource).toContain("app.post('/api/auth/judge/generate-password', ...role('organizer')");
  });
});
