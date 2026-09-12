import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';
import { createApp } from '../src/app.js';

const config = {
  nodeEnv: 'test', frontendOrigin: 'http://localhost:5173', sessionCookieName: 'bb_session', sessionTtlHours: 8, uploadDir: '/tmp/bit-and-build-uploads',
};
const team = { id: '11111111-1111-4111-8111-111111111111', team_name: 'Web Warriors', leader_name: 'Peter Parker', leader_email: 'peter@example.com', college: 'Empire State University' };
const payload = { teamName: team.team_name, leaderName: team.leader_name, leaderEmail: team.leader_email, college: team.college, loginName: 'web-warriors-1234', password: 'private-team-password' };

function makePool({ databaseError } = {}) {
  const queries = [];
  const client = {
    query: vi.fn(async (sql) => {
      queries.push(sql);
      if (databaseError && sql.startsWith('INSERT INTO teams')) throw databaseError;
      if (sql.startsWith('INSERT INTO teams')) return { rows: [team] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return {
    queries,
    client,
    query: vi.fn(async () => ({ rows: [{ id: 'admin-id', email: 'admin@example.com', display_name: 'Admin', role: 'organizer', team_id: null }] })),
    connect: vi.fn(async () => client),
  };
}

function register(app) {
  return request(app).post('/api/teams').set('Cookie', 'bb_session=valid-session').send(payload);
}

describe('team registration and transactional email delivery', () => {
  test('commits the team and sends its credentials through the injected email service', async () => {
    const pool = makePool();
    const send = vi.fn().mockResolvedValue({ ok: true, id: 'email_123' });
    const app = createApp({ pool, config, emailService: { send }, logger: { error: vi.fn() } });
    const response = await register(app);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ credentials: { loginName: payload.loginName }, credentialEmail: 'sent' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: team.leader_email, subject: expect.stringMatching(/credentials/i) }));
    expect(pool.queries).toContain('COMMIT');
    expect(pool.client.release).toHaveBeenCalledOnce();
  });

  test('keeps the committed team and reports email delivery failure without leaking credentials', async () => {
    const pool = makePool();
    const logger = { error: vi.fn() };
    const app = createApp({ pool, config, emailService: { send: vi.fn().mockResolvedValue({ ok: false, code: 'EMAIL_DELIVERY_ERROR' }) }, logger });
    const response = await register(app);
    expect(response.status).toBe(201);
    expect(response.body.credentialEmail).toBe('not_sent');
    expect(response.text).not.toContain(payload.password);
    expect(pool.queries).toContain('COMMIT');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(payload.password);
  });

  test('rolls back database failures, returns a safe error, and redacts secrets from logs', async () => {
    const pool = makePool({ databaseError: Object.assign(new Error('connection rejected re_sensitive-token password=secret-value'), { code: '08006' }) });
    const logger = { error: vi.fn() };
    const app = createApp({ pool, config, emailService: { send: vi.fn() }, logger });
    const response = await register(app);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    expect(pool.queries).toContain('ROLLBACK');
    const logs = JSON.stringify(logger.error.mock.calls);
    expect(logs).not.toContain('re_sensitive-token');
    expect(logs).not.toContain('secret-value');
    expect(logs).not.toContain(payload.password);
  });
});
