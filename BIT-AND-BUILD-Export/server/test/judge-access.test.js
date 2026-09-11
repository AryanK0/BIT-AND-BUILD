import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';

const config = { nodeEnv: 'test', frontendOrigin: 'http://localhost:5173', sessionCookieName: 'bb_session', sessionTtlHours: 8, uploadDir: '/tmp/bit-and-build-uploads', organizerEmail: 'admin@bitandbuild.com', organizerPassword: 'organizer2026', judgeId: 'JUDGE-001' };
const loginOrganizer = (app) => request(app).post('/api/auth/organizer/login').send({ email: config.organizerEmail, password: config.organizerPassword });

describe('one-time judge password', () => {
  test('only organizer can generate a password', async () => {
    const app = createApp({ pool: {}, config });
    const denied = await request(app).post('/api/auth/judge/password');
    expect(denied.status).toBe(403);
    const organizer = await loginOrganizer(app);
    const generated = await request(app).post('/api/auth/judge/password').set('Cookie', organizer.headers['set-cookie']);
    expect(generated.status).toBe(200);
    expect(generated.body.judgeId).toBe('JUDGE-001');
    expect(generated.body.password).toMatch(/^[A-F0-9]{12}$/);
  });

  test('password is consumed on successful judge login', async () => {
    const app = createApp({ pool: {}, config });
    const organizer = await loginOrganizer(app);
    const generated = await request(app).post('/api/auth/judge/password').set('Cookie', organizer.headers['set-cookie']);
    const login = await request(app).post('/api/auth/judge/login').send({ judgeId: 'JUDGE-001', password: generated.body.password });
    expect(login.status).toBe(200);
    const reused = await request(app).post('/api/auth/judge/login').send({ judgeId: 'JUDGE-001', password: generated.body.password });
    expect(reused.status).toBe(401);
  });

  test('logout invalidates judge session and organizer can generate another password', async () => {
    const app = createApp({ pool: {}, config });
    const organizer = await loginOrganizer(app);
    const first = await request(app).post('/api/auth/judge/password').set('Cookie', organizer.headers['set-cookie']);
    const judge = await request(app).post('/api/auth/judge/login').send({ judgeId: 'JUDGE-001', password: first.body.password });
    const logout = await request(app).post('/api/auth/logout').set('Cookie', judge.headers['set-cookie']);
    expect(logout.status).toBe(204);
    const second = await request(app).post('/api/auth/judge/password').set('Cookie', organizer.headers['set-cookie']);
    expect(second.status).toBe(200);
    expect(second.body.password).not.toBe(first.body.password);
  });
});
