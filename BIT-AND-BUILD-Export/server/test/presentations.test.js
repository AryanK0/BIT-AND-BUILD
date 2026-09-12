import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { isAllowedPresentationFile } from '../src/app.js';

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
});
