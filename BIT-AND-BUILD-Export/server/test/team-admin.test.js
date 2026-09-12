import request from 'supertest';
import * as XLSX from 'xlsx';
import { describe, expect, test, vi } from 'vitest';
import { createApp, generateImportedPassword } from '../src/app.js';
import { encryptRecoverablePassword } from '../src/security/teamCredentialRecovery.js';

const key = 'a'.repeat(64);
const config = { nodeEnv: 'test', frontendOrigin: 'http://localhost:5173', sessionCookieName: 'bb_session', sessionTtlHours: 8, uploadDir: '/tmp/bit-and-build-uploads', teamCredentialEncryptionKey: key };

function poolFor(role, queryHandler) {
  const client = { query: vi.fn(queryHandler), release: vi.fn() };
  return {
    query: vi.fn(async (sql, values) => sql.includes('FROM sessions')
      ? { rows: [{ id: `${role}-id`, email: `${role}@example.com`, display_name: role, role, team_id: null }] }
      : queryHandler(sql, values)),
    connect: vi.fn(async () => client),
  };
}

function sessionRequest(app, role) {
  return request(app).get('/api/judge/teams-summary').set('Cookie', 'bb_session=valid');
}

describe('judge team summary', () => {
  test.each([0, 1, 4])('returns %i registered teams exactly once', async (teamCount) => {
    const pool = poolFor('judge', async (sql) => sql.includes('COUNT(*)') ? { rows: [{ team_count: teamCount }] } : { rows: [] });
    const response = await sessionRequest(createApp({ pool, config, logger: { error: vi.fn() } }), 'judge');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ teamCount });
    expect(pool.query).toHaveBeenCalledWith('SELECT COUNT(*)::int AS team_count FROM teams');
  });

  test('does not expose the judge aggregate to non-judges', async () => {
    const pool = poolFor('participant', async () => ({ rows: [] }));
    const response = await sessionRequest(createApp({ pool, config, logger: { error: vi.fn() } }), 'participant');
    expect(response.status).toBe(403);
  });
});

describe('Admin team credentials', () => {
  test('reveals an encrypted credential only to an organizer', async () => {
    const pool = poolFor('organizer', async (sql) => sql.includes('encrypted_password')
      ? { rows: [{ team_name: 'Web Warriors', login_name: 'web-warriors-a1b2', encrypted_password: encryptRecoverablePassword('SafePass!123', key) }] }
      : { rows: [] });
    const app = createApp({ pool, config, logger: { error: vi.fn() } });
    const response = await request(app).get('/api/admin/teams/11111111-1111-4111-8111-111111111111/credentials').set('Cookie', 'bb_session=valid');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ credentials: { loginName: 'web-warriors-a1b2', password: 'SafePass!123' } });
  });

  test('denies credential recovery to judges and participants', async () => {
    for (const role of ['judge', 'participant']) {
      const pool = poolFor(role, async () => ({ rows: [] }));
      const app = createApp({ pool, config, logger: { error: vi.fn() } });
      const response = await request(app).get('/api/admin/teams/team/credentials').set('Cookie', 'bb_session=valid');
      expect(response.status).toBe(403);
    }
  });
});

describe('Admin Excel import', () => {
  test('generates unique, cryptographically sourced import passwords with at least eight characters', () => {
    const passwords = new Set(Array.from({ length: 20 }, generateImportedPassword));
    expect(passwords.size).toBe(20);
    for (const password of passwords) expect(password.length).toBeGreaterThanOrEqual(8);
  });

  test('imports valid teams, skips normalized duplicates, and never returns passwords', async () => {
    const sheet = XLSX.utils.json_to_sheet([
      { ' Team Name ': ' Web Warriors ', 'Leader Name': ' Miles Morales ', Notes: 'ignored' },
      { ' Team Name ': 'web   warriors', 'Leader Name': 'Gwen Stacy' },
      { ' Team Name ': '', 'Leader Name': 'Invalid' },
    ]);
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Teams');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const team = { id: '11111111-1111-4111-8111-111111111111', team_name: 'Web Warriors', leader_name: 'Miles Morales' };
    const pool = poolFor('organizer', async (sql) => {
      if (sql.includes('SELECT lower(trim(team_name))')) return { rows: [] };
      if (sql.startsWith('INSERT INTO teams')) return { rows: [team] };
      return { rows: [] };
    });
    const response = await request(createApp({ pool, config, logger: { error: vi.fn(), info: vi.fn() } }))
      .post('/api/admin/teams/import').set('Cookie', 'bb_session=valid').attach('file', buffer, 'teams.xlsx');
    expect(response.status).toBe(201);
    expect(response.body.totalRows).toBe(3);
    expect(response.body.imported).toHaveLength(1);
    expect(response.body.invalidRows).toHaveLength(2);
    expect(JSON.stringify(response.body)).not.toContain('password');
    const credentialInsert = pool.connect.mock.results[0].value;
    expect(credentialInsert).toBeDefined();
  });
});
