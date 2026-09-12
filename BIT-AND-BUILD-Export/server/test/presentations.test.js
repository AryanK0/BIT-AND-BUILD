import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';
import { createApp, isAllowedPresentationFile } from '../src/app.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const appSource = await fs.readFile(path.resolve(directory, '../src/app.js'), 'utf8');
const judgeDashboardSource = await fs.readFile(path.resolve(directory, '../../client/src/pages/JudgeDashboard.jsx'), 'utf8');
const migration = await fs.readFile(path.resolve(directory, '../migrations/005_presentations.sql'), 'utf8');
const durableStorageMigration = await fs.readFile(path.resolve(directory, '../migrations/009_presentation_file_data.sql'), 'utf8');

describe('presentation uploads', () => {
  test('allows only PowerPoint files', () => {
    expect(isAllowedPresentationFile({ originalname: 'final.pdf', mimetype: 'application/pdf' })).toBe(false);
    expect(isAllowedPresentationFile({ originalname: 'final.pptx', mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })).toBe(true);
    expect(isAllowedPresentationFile({ originalname: 'malware.exe', mimetype: 'application/octet-stream' })).toBe(false);
    expect(isAllowedPresentationFile({ originalname: 'notes.txt', mimetype: 'text/plain' })).toBe(false);
  });

  test('persists one private presentation record per team', () => {
    expect(migration).toMatch(/team_id UUID NOT NULL UNIQUE REFERENCES teams\(id\) ON DELETE CASCADE/);
    expect(migration).toMatch(/original_filename TEXT NOT NULL/);
    expect(migration).toMatch(/stored_filename TEXT NOT NULL UNIQUE/);
    expect(migration).toMatch(/mime_type TEXT NOT NULL/);
    expect(durableStorageMigration).toMatch(/file_data BYTEA/);
    expect(durableStorageMigration).toMatch(/file_checksum TEXT/);
  });

  test('uses authenticated participant, Admin, and Judge presentation routes', () => {
    expect(appSource).toContain("app.post('/api/presentations', ...role('participant')");
    expect(appSource).toContain("app.get('/api/presentations/me/file', ...role('participant')");
    expect(appSource).toContain("app.get('/api/admin/teams/:teamId/presentation', ...role('organizer')");
    expect(appSource).toContain("app.get('/api/judge/teams/:teamId/presentation', ...role('judge')");
    expect(appSource).toContain("req.session.teamId");
  });

  test('uses a credentialed Blob download rather than navigating the judge browser to the API URL', () => {
    expect(judgeDashboardSource).toContain("fetch(`${API_BASE}/api/judge/teams/${presentation.team_id}/presentation`, { credentials: 'include' })");
    expect(judgeDashboardSource).toContain('await response.blob()');
    expect(judgeDashboardSource).toContain('window.URL.createObjectURL(blob)');
    expect(judgeDashboardSource).not.toContain('target="_blank" rel="noreferrer">View / Download');
  });

  test('keeps the judge download state in the dashboard scope so submitted rows cannot crash rendering', () => {
    const scoreComponent = judgeDashboardSource.slice(judgeDashboardSource.indexOf('function PresentationScore'), judgeDashboardSource.indexOf('function JudgeDashboard'));
    const dashboardComponent = judgeDashboardSource.slice(judgeDashboardSource.indexOf('function JudgeDashboard'));
    expect(scoreComponent).not.toContain('setDownloadingPresentationId');
    expect(dashboardComponent).toContain('const [downloadingPresentationId, setDownloadingPresentationId] = useState(null)');
    expect(judgeDashboardSource).toContain('presentationsError ?');
    expect(judgeDashboardSource).toContain('presentationsLoading ?');
  });

  test('accepts the presentation multipart field and returns the Round 1 metadata', async () => {
    const uploadDir = path.join(process.cwd(), '.test-private-uploads');
    const teamId = '11111111-1111-4111-8111-111111111111';
    const client = {
      query: vi.fn(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.startsWith('SELECT status')) return { rows: [] };
        if (sql.startsWith('INSERT INTO presentations')) return { rows: [{ original_filename: 'round-1.pptx', mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', uploaded_at: '2026-01-01T00:00:00.000Z' }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn(async (sql) => sql.includes('FROM sessions') ? { rows: [{ id: 'participant-id', email: 'team@example.com', display_name: 'Team', role: 'participant', team_id: teamId, expires_at: new Date(Date.now() + 60000) }] } : { rows: [] }),
      connect: vi.fn(async () => client),
    };
    const app = createApp({ pool, config: { nodeEnv: 'test', frontendOrigin: 'http://localhost:5173', sessionCookieName: 'bb_session', sessionTtlHours: 8, uploadDir }, logger: { error: vi.fn() } });
    const response = await request(app).post('/api/presentations').set('Cookie', 'bb_session=valid').attach('presentation', Buffer.from('pptx fixture'), { filename: 'round-1.pptx', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ presentation: { originalFilename: 'round-1.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', uploadedAt: '2026-01-01T00:00:00.000Z' } });
    const insert = client.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO presentations'));
    expect(insert[1][4]).toEqual(Buffer.from('pptx fixture'));
    expect(insert[1][5]).toBe(Buffer.byteLength('pptx fixture'));
    await expect(fs.access(uploadDir)).rejects.toThrow();
  });

  test('lists and downloads a persisted PPT for an authenticated judge', async () => {
    const teamId = '11111111-1111-4111-8111-111111111111';
    const ppt = Buffer.from('persisted-pptx');
    const pool = {
      connect: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.includes('FROM sessions')) return { rows: [{ id: 'judge-id', email: 'judge@example.com', display_name: 'Judge', role: 'judge', team_id: null, expires_at: new Date(Date.now() + 60000) }] };
        if (sql.includes('FROM teams t LEFT JOIN presentations')) return { rows: [{ team_id: teamId, team_name: 'Web Warriors', original_filename: 'round-1.pptx', mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', uploaded_at: '2026-01-01T00:00:00.000Z', team_members: [] }] };
        if (sql.startsWith('SELECT p.id,p.team_id,p.original_filename')) return { rows: [{ team_id: teamId, team_name: 'Web Warriors', original_filename: 'round-1.pptx', stored_filename: 'legacy.pptx', mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', file_data: ppt }] };
        return { rows: [] };
      }),
    };
    const app = createApp({ pool, config: { nodeEnv: 'test', frontendOrigin: 'http://localhost:5173', sessionCookieName: 'bb_session', sessionTtlHours: 8, uploadDir: '/unused' }, logger: { error: vi.fn() } });
    const list = await request(app).get('/api/judge/presentations').set('Cookie', 'bb_session=valid');
    expect(list.status).toBe(200);
    expect(list.body.presentations).toHaveLength(1);
    const download = await request(app).get(`/api/judge/teams/${teamId}/presentation`).set('Cookie', 'bb_session=valid').buffer(true).parse((response, callback) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment; filename="Web Warriors-presentation.pptx"');
    expect(download.body).toEqual(ppt);
  });

  test('returns 401 without a session and 403 for a non-judge role', async () => {
    const baseConfig = { nodeEnv: 'test', frontendOrigin: 'http://localhost:5173', sessionCookieName: 'bb_session', sessionTtlHours: 8, uploadDir: '/unused' };
    const anonymous = createApp({ pool: { query: vi.fn(), connect: vi.fn() }, config: baseConfig, logger: { error: vi.fn() } });
    expect((await request(anonymous).get('/api/judge/teams/11111111-1111-4111-8111-111111111111/presentation')).status).toBe(401);
    const participantPool = { connect: vi.fn(), query: vi.fn(async (sql) => sql.includes('FROM sessions') ? { rows: [{ id: 'participant-id', email: 'participant@example.com', display_name: 'Participant', role: 'participant', team_id: '11111111-1111-4111-8111-111111111111', expires_at: new Date(Date.now() + 60000) }] } : { rows: [] }) };
    const participantApp = createApp({ pool: participantPool, config: baseConfig, logger: { error: vi.fn() } });
    expect((await request(participantApp).get('/api/judge/teams/11111111-1111-4111-8111-111111111111/presentation').set('Cookie', 'bb_session=valid')).status).toBe(403);
  });

  test('returns 404 when an authenticated judge requests a team with no presentation', async () => {
    const pool = { connect: vi.fn(), query: vi.fn(async (sql) => sql.includes('FROM sessions') ? { rows: [{ id: 'judge-id', email: 'judge@example.com', display_name: 'Judge', role: 'judge', team_id: null, expires_at: new Date(Date.now() + 60000) }] } : { rows: [] }) };
    const app = createApp({ pool, config: { nodeEnv: 'test', frontendOrigin: 'http://localhost:5173', sessionCookieName: 'bb_session', sessionTtlHours: 8, uploadDir: '/unused' }, logger: { error: vi.fn() } });
    expect((await request(app).get('/api/judge/teams/22222222-2222-4222-8222-222222222222/presentation').set('Cookie', 'bb_session=valid')).status).toBe(404);
  });
});
