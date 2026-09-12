import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { calculatePresentationEvaluation, calculateScore, presentationEvaluationSchema, scoreRequestSchema } from '../src/scoring.js';

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
  test('accepts only integer values from 0 to 10', () => {
    expect(() => scoreRequestSchema.parse({ ...completeScore, ui_ux: 11 })).toThrow();
    expect(() => scoreRequestSchema.parse({ ...completeScore, ui_ux: 2.5 })).toThrow();
    expect(() => scoreRequestSchema.parse({ ...completeScore, ui_ux: -1 })).toThrow();
  });

  test('calculates the server-side weighted score', () => {
    const maximum = calculateScore(completeScore);
    expect(maximum.finalScore).toBe(100);
    expect(maximum.weightedScores).toMatchObject({ completeness: 20, technical_execution: 20, innovation_creativity: 15 });
    const midpoint = calculateScore(Object.fromEntries(Object.entries(completeScore).map(([key, value]) => [key, typeof value === 'number' ? 5 : value])));
    expect(midpoint.finalScore).toBe(50);
    expect(midpoint.weightedScores.innovation_creativity).toBe(7.5);
  });
});

describe('presentation evaluation rubric', () => {
  const evaluation = {
    completeness: 20, technical_execution: 20, innovation_creativity: 15,
    applicability_scalability: 15, ui_ux: 10, bonus_features: 10,
    presentation: 5, work_distribution: 5, comments: 'Complete review',
  };

  test('contains all eight criteria and totals exactly 100', () => {
    const result = calculatePresentationEvaluation(evaluation);
    expect(Object.keys(result.weightedScores)).toEqual(['completeness', 'technical_execution', 'innovation_creativity', 'applicability_scalability', 'ui_ux', 'bonus_features', 'presentation', 'work_distribution']);
    expect(result.finalScore).toBe(100);
  });

  test('enforces each criterion maximum and rejects negative or fractional marks', () => {
    expect(() => presentationEvaluationSchema.parse({ ...evaluation, completeness: 21 })).toThrow();
    expect(() => presentationEvaluationSchema.parse({ ...evaluation, presentation: 6 })).toThrow();
    expect(() => presentationEvaluationSchema.parse({ ...evaluation, work_distribution: -1 })).toThrow();
    expect(() => presentationEvaluationSchema.parse({ ...evaluation, ui_ux: 2.5 })).toThrow();
  });

  test('a judge can save an evaluation only for an existing presentation', async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.includes('FROM sessions')) return { rows: [{ id: 'judge-id', email: 'judge@example.com', display_name: 'Judge', role: 'judge', expires_at: new Date(Date.now() + 60000) }] };
        if (sql.startsWith('SELECT id FROM presentations')) return { rows: [{ id: 'presentation-id' }] };
        if (sql.startsWith('INSERT INTO presentation_scores')) return { rows: [{ ...evaluation, final_score: 100, updated_at: '2026-01-01T00:00:00.000Z' }] };
        return { rows: [] };
      }),
    };
    const response = await request(createApp({ pool, config: testConfig, logger: { error: () => {} } }))
      .post(`/api/judge/presentations/${teamId}/score`).set('Cookie', 'bb_session=valid').send(evaluation);
    expect(response.status).toBe(200);
    expect(response.body.presentationEvaluation.final_score).toBe(100);
    const insert = pool.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO presentation_scores'));
    expect(insert[1]).toContain(100);
  });

  test('does not allow an unauthenticated or non-judge user to save an evaluation', async () => {
    const anonymous = createApp({ pool: { query: vi.fn(), connect: vi.fn() }, config: testConfig, logger: { error: () => {} } });
    expect((await request(anonymous).post(`/api/judge/presentations/${teamId}/score`).send(evaluation)).status).toBe(401);
    const participantPool = { connect: vi.fn(), query: vi.fn(async (sql) => sql.includes('FROM sessions') ? { rows: [{ id: 'participant-id', email: 'team@example.com', display_name: 'Team', role: 'participant', expires_at: new Date(Date.now() + 60000) }] } : { rows: [] }) };
    const participant = createApp({ pool: participantPool, config: testConfig, logger: { error: () => {} } });
    expect((await request(participant).post(`/api/judge/presentations/${teamId}/score`).set('Cookie', 'bb_session=valid').send(evaluation)).status).toBe(403);
  });
});
