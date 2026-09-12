import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { hashOrganizerPassword, normalizeOrganizerEmail, validateOrganizerSeed } from '../src/scripts/seed-organizer.js';
import { assertTestDatabaseUrl } from '../src/db/migrate.js';

const directory = path.dirname(fileURLToPath(import.meta.url));

describe('migration safeguards', () => {
  test('uses an optional local env file so Render can use its injected environment', async () => {
    const packageJson = JSON.parse(await fs.readFile(path.resolve(directory, '../package.json'), 'utf8'));
    expect(packageJson.scripts['db:migrate']).toBe('node --env-file-if-exists=.env src/db/migrate.js');
  });

  test('refuses a test migration URL that is also the deployment database URL', () => {
    expect(() => assertTestDatabaseUrl({
      testDatabaseUrl: 'postgresql://user:pass@db.example.com:5432/portal',
      deploymentDatabaseUrl: 'postgresql://user:pass@db.example.com:5432/portal',
    })).toThrow(/must not match/i);
  });

  test('accepts a distinct explicit test database URL', () => {
    expect(() => assertTestDatabaseUrl({
      testDatabaseUrl: 'postgresql://user:pass@localhost:5432/portal_test',
      deploymentDatabaseUrl: 'postgresql://user:pass@db.example.com:5432/portal',
    })).not.toThrow();
  });
});

describe('organizer seed validation', () => {
  test('normalizes an organizer email before it is persisted', () => {
    expect(normalizeOrganizerEmail('  ADMIN@Example.EDU ')).toBe('admin@example.edu');
  });

  test('rejects a weak organizer password before opening a database connection', () => {
    expect(() => validateOrganizerSeed({
      email: 'admin@example.edu',
      password: 'short',
    })).toThrow(/at least 14 characters/i);
  });

  test('uses an Argon2id password hash for the initial organizer', async () => {
    const hash = await hashOrganizerPassword('A-longer-test-password-2026!');
    expect(hash).toMatch(/^\$argon2id\$/);
  });
});
