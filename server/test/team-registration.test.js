import argon2 from 'argon2';
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
      if (sql.startsWith('INSERT INTO users')) {
        expect(sql).toBe("INSERT INTO users (email,display_name,role,password_hash,team_id) VALUES ($1,$2,'participant',$3,$4)");
      }
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

describe('team registration', () => {
  test('commits the team and returns its login name without email configuration', async () => {
    const pool = makePool();
    const app = createApp({ pool, config, logger: { error: vi.fn() } });
    const response = await register(app);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ credentials: { loginName: payload.loginName } });
    expect(Object.keys(response.body).sort()).toEqual(['credentials', 'team']);
    expect(pool.queries).toContain('COMMIT');
    expect(pool.client.release).toHaveBeenCalledOnce();
  });

  test('rejects invalid registration data before opening a transaction', async () => {
    const pool = makePool();
    const app = createApp({ pool, config, logger: { error: vi.fn() } });
    const response = await request(app).post('/api/teams').set('Cookie', 'bb_session=valid-session').send({ ...payload, leaderEmail: 'not-an-email' });
    expect(response.status).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('accepts the stored team credential at participant login', async () => {
    const passwordHash = await argon2.hash(payload.password, { type: argon2.argon2id });
    const pool = {
      query: vi.fn(async (sql) => {
        if (sql.includes('FROM team_credentials')) return { rows: [{ team_id: team.id, password_hash: passwordHash, id: 'participant-id', email: team.leader_email, display_name: team.leader_name, enabled: true }] };
        return { rows: [] };
      }),
      connect: vi.fn(),
    };
    const app = createApp({ pool, config, logger: { error: vi.fn() } });
    const response = await request(app).post('/api/auth/participant/login').send({ identifier: payload.loginName, password: payload.password });
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ id: 'participant-id', email: team.leader_email, role: 'participant', teamId: team.id });
  });

  test('rolls back database failures, returns a safe error, and redacts secrets from logs', async () => {
    const pool = makePool({ databaseError: Object.assign(new Error('connection rejected postgresql://db-user:db-secret@db.example/database re_sensitive-token password=secret-value'), { code: '08006' }) });
    const logger = { error: vi.fn() };
    const app = createApp({ pool, config, logger });
    const response = await register(app);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    expect(pool.queries).toContain('ROLLBACK');
    const logs = JSON.stringify(logger.error.mock.calls);
    expect(logs).toContain('insert_team');
    expect(logs).not.toContain('db-secret');
    expect(logs).not.toContain('re_sensitive-token');
    expect(logs).not.toContain('secret-value');
    expect(logs).not.toContain(payload.password);
  });
});
