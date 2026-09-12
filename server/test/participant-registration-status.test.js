import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';
import { createApp } from '../src/app.js';

const config = { nodeEnv: 'test', frontendOrigin: 'http://localhost:5173', sessionCookieName: 'bb_session', sessionTtlHours: 8, uploadDir: '/tmp/bit-and-build-uploads' };
const session = { id: 'participant-id', email: 'leader@example.com', display_name: 'Leader', role: 'participant', team_id: '11111111-1111-4111-8111-111111111111', expires_at: new Date(Date.now() + 60000) };

function appWithRegistration(row) {
  const query = vi.fn(async (sql, values) => {
    if (sql.includes('FROM sessions')) return { rows: [session] };
    if (sql.includes("JOIN users u ON u.team_id=t.id WHERE u.id=$1")) {
      expect(values).toEqual(['participant-id']);
      return { rows: row ? [row] : [] };
    }
    return { rows: [] };
  });
  return { app: createApp({ pool: { query, connect: vi.fn() }, config, logger: { error: vi.fn() } }), query };
}

describe('participant registration status', () => {
  test('returns a registered team only when the session user is attached to it', async () => {
    const { app } = appWithRegistration({ id: session.team_id, team_name: 'Web Warriors', leader_name: 'Leader', leader_email: session.email, team_members: [] });
    const response = await request(app).get('/api/teams/me').set('Cookie', 'bb_session=valid');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ registered: true, team: { id: session.team_id, team_name: 'Web Warriors' } });
  });

  test('confirms an unattached participant is unregistered without exposing another team', async () => {
    const { app } = appWithRegistration(null);
    const response = await request(app).get('/api/teams/me').set('Cookie', 'bb_session=valid');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ registered: false, team: null });
  });
});
