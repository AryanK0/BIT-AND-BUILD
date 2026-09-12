import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';
import { createApp, isAllowedPresentationFile } from '../src/app.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const appSource = await fs.readFile(path.resolve(directory, '../src/app.js'), 'utf8');
const migration = await fs.readFile(path.resolve(directory, '../migrations/005_presentations.sql'), 'utf8');

describe('presentation uploads', () => {
  test('allows only PDF and PowerPoint files', () => {
    expect(isAllowedPresentationFile({ originalname: 'final.pdf', mimetype: 'application/pdf' })).toBe(true);
    expect(isAllowedPresentationFile({ originalname: 'final.pptx', mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })).toBe(true);
    expect(isAllowedPresentationFile({ originalname: 'malware.exe', mimetype: 'application/octet-stream' })).toBe(false);
    expect(isAllowedPresentationFile({ originalname: 'notes.txt', mimetype: 'text/plain' })).toBe(false);
  });

  test('persists one private presentation record per team', () => {
    expect(migration).toMatch(/team_id UUID NOT NULL UNIQUE REFERENCES teams\(id\) ON DELETE CASCADE/);
    expect(migration).toMatch(/original_filename TEXT NOT NULL/);
    expect(migration).toMatch(/stored_filename TEXT NOT NULL UNIQUE/);
    expect(migration).toMatch(/mime_type TEXT NOT NULL/);
  });

  test('uses authenticated participant, Admin, and Judge presentation routes', () => {
    expect(appSource).toContain("app.post('/api/presentations', ...role('participant')");
    expect(appSource).toContain("app.get('/api/presentations/me/file', ...role('participant')");
    expect(appSource).toContain("app.get('/api/admin/teams/:teamId/presentation', ...role('organizer')");
    expect(appSource).toContain("app.get('/api/judge/teams/:teamId/presentation', ...role('judge')");
    expect(appSource).toContain("req.session.teamId");
  });

  test('accepts the presentation multipart field and returns the Round 1 metadata', async () => {
    const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-and-build-presentation-'));
    const teamId = '11111111-1111-4111-8111-111111111111';
    const client = {
      query: vi.fn(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.startsWith('SELECT status')) return { rows: [] };
        if (sql.startsWith('SELECT stored_filename')) return { rows: [] };
        if (sql.startsWith('INSERT INTO presentations')) return { rows: [{ original_filename: 'round-1.pdf', mime_type: 'application/pdf', uploaded_at: '2026-01-01T00:00:00.000Z' }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn(async (sql) => sql.includes('FROM sessions') ? { rows: [{ id: 'participant-id', email: 'team@example.com', display_name: 'Team', role: 'participant', team_id: teamId, expires_at: new Date(Date.now() + 60000) }] } : { rows: [] }),
      connect: vi.fn(async () => client),
    };
    const app = createApp({ pool, config: { nodeEnv: 'test', frontendOrigin: 'http://localhost:5173', sessionCookieName: 'bb_session', sessionTtlHours: 8, uploadDir }, logger: { error: vi.fn() } });
    try {
      const response = await request(app).post('/api/presentations').set('Cookie', 'bb_session=valid').attach('presentation', Buffer.from('%PDF-1.4'), { filename: 'round-1.pdf', contentType: 'application/pdf' });
      expect(response.status).toBe(201);
      expect(response.body).toEqual({ presentation: { originalFilename: 'round-1.pdf', mimeType: 'application/pdf', uploadedAt: '2026-01-01T00:00:00.000Z' } });
      expect(client.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO presentations'))).toBe(true);
      expect((await fs.readdir(uploadDir))).toHaveLength(1);
    } finally {
      await fs.rm(uploadDir, { recursive: true, force: true });
    }
  });
});
