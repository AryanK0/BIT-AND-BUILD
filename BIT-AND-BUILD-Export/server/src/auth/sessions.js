import crypto from 'node:crypto';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export async function createSession(pool, user, ttlHours) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, role, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [hashToken(token), user.id, user.role, expiresAt],
  );
  return token;
}

export async function getSession(pool, token) {
  if (!token) return null;
  const result = await pool.query(
    `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.display_name,
            u.role, u.team_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.enabled = TRUE`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    role: row.role,
    teamId: row.team_id,
    expiresAt: row.expires_at,
  };
}

export async function deleteSession(pool, token) {
  if (!token) return;
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}
