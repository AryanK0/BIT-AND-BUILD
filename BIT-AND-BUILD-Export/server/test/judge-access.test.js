import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));
const appSource = await fs.readFile(path.resolve(directory, '../src/app.js'), 'utf8');
const migration = await fs.readFile(path.resolve(directory, '../migrations/004_multiple_judges.sql'), 'utf8');

describe('one-time judge password implementation', () => {
  test('persists only a hash and consumes the credential in a transaction', () => {
    expect(migration).toMatch(/CREATE TABLE judges/);
    expect(migration).toMatch(/password_hash TEXT/);
    expect(migration).not.toMatch(/password TEXT NOT NULL/);
    expect(appSource).toMatch(/UPDATE judges SET password_hash/);
    expect(appSource).toMatch(/FOR UPDATE/);
    expect(appSource).toMatch(/password_hash=NULL,credential_status='consumed'/);
    expect(appSource).not.toMatch(/pendingJudgePasswordHash/);
  });

  test('keeps password generation restricted to organizers', () => {
    expect(appSource).toContain("app.post('/api/admin/judges', ...role('organizer')");
    expect(appSource).toContain("app.post('/api/admin/judges/:judgeId/regenerate-password', ...role('organizer')");
    expect(appSource).toContain("app.get('/api/admin/judge-scoring', ...role('organizer')");
  });
});
