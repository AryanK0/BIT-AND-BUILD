import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';

const testConfig = {
  nodeEnv: 'test',
  frontendOrigin: 'http://localhost:5173',
  sessionCookieName: 'bb_session',
  sessionTtlHours: 8,
  uploadDir: '/tmp/bit-and-build-uploads',
};

const teamId = '11111111-1111-4111-8111-111111111111';
const completeScore = {
  team_id: teamId,
  judge_email: 'judge@example.com',
  completeness: 10,
  technical_execution: 10,
  innovation_creativity: 10,
  applicability_scalability: 10,
  ui_ux: 10,
  bonus_features: 10,
  presentation: 10,
  work_distribution: 10,
  comments: 'Excellent project',
};

function makeApp(options = {}) {
  return createApp({ pool: {}, config: testConfig, ...options });
}

describe('health endpoint', () => {
  test('GET /api/health returns a safe health payload', async () => {
    const response = await request(makeApp())
      .get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('unknown API routes return a JSON 404 payload', async () => {
    const response = await request(makeApp()).get('/api/not-a-route');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
    expect(response.headers['content-type']).toMatch(/json/);
  });

  test('CORS allows the configured frontend origin with credentials', async () => {
    const response = await request(makeApp())
      .get('/api/health')
      .set('Origin', testConfig.frontendOrigin);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin'])
      .toBe(testConfig.frontendOrigin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  test('CORS rejects an unapproved origin with a safe generic response', async () => {
    const errors = [];
    const response = await request(makeApp({
      logger: { error: (event) => errors.push(event) },
    }))
      .get('/api/health')
      .set('Origin', 'https://malicious.example');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Request is not allowed' },
    });
    expect(response.text).not.toContain('malicious.example');
    expect(errors[0]).toMatchObject({
      event: 'http_error',
      status: 403,
      method: 'GET',
      path: '/api/health',
    });
    expect(JSON.stringify(errors)).not.toContain('malicious.example');
  });

  test('malformed JSON returns a safe generic error response', async () => {
    const errors = [];
    const response = await request(makeApp({
      logger: { error: (event) => errors.push(event) },
    }))
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"token":"do-not-return",');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Request could not be processed' },
    });
    expect(response.text).not.toContain('do-not-return');
    expect(JSON.stringify(errors)).not.toContain('do-not-return');
  });
});

describe('score endpoints', () => {
  test('rejects incomplete or out-of-range scores before querying the database', async () => {
    const pool = { query: () => { throw new Error('should not query'); } };
    const response = await request(makeApp({ pool }))
      .post('/api/scores')
      .send({ ...completeScore, ui_ux: 11 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Request could not be processed' },
    });
  });

  test('calculates and persists a maximum weighted score', async () => {
    let queryArgs;
    const pool = {
      query: async (_query, args) => {
        queryArgs = args;
        return { rows: [{ id: 'score-1', final_score: 100 }] };
      },
    };
    const response = await request(makeApp({ pool }))
      .post('/api/scores')
      .send(completeScore);

    expect(response.status).toBe(200);
    expect(response.body.score.final_score).toBe(100);
    expect(queryArgs[13]).toEqual({
      completeness: 20,
      technical_execution: 20,
      innovation_creativity: 15,
      applicability_scalability: 15,
      ui_ux: 10,
      bonus_features: 10,
      presentation: 5,
      work_distribution: 5,
    });
    expect(queryArgs[14]).toBe(100);
  });

  test('calculates decimal weighted scores', async () => {
    let queryArgs;
    const pool = {
      query: async (_query, args) => {
        queryArgs = args;
        return { rows: [{ final_score: 50 }] };
      },
    };
    await request(makeApp({ pool }))
      .post('/api/scores')
      .send(Object.fromEntries(Object.entries(completeScore).map(([key, value]) => [
        key,
        typeof value === 'number' ? 5 : value,
      ])));

    expect(queryArgs[13].innovation_creativity).toBe(7.5);
    expect(queryArgs[14]).toBe(50);
  });
});
