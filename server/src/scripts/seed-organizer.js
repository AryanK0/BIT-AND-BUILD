import argon2 from 'argon2';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

export function normalizeOrganizerEmail(email) {
  return email.trim().toLowerCase();
}

export function validateOrganizerSeed({ email, password }) {
  if (!email || !password) throw new Error('Organizer email and password are required');
  const normalizedEmail = normalizeOrganizerEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Organizer email is invalid');
  }
  if (password.length < 14) throw new Error('Organizer password must be at least 14 characters');
  return { email: normalizedEmail, password };
}

export async function hashOrganizerPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function seedOrganizer({ databaseUrl = process.env.DATABASE_URL, email = process.env.INITIAL_ORGANIZER_EMAIL, password = process.env.INITIAL_ORGANIZER_PASSWORD } = {}) {
  const seed = validateOrganizerSeed({ email, password });
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const passwordHash = await hashOrganizerPassword(seed.password);
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(
      `INSERT INTO users (email, password_hash, user_role)
       VALUES ($1, $2, 'organizer')
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         user_role = 'organizer'`,
      [seed.email, passwordHash],
    );
  } finally {
    await pool.end();
  }
}

const currentFile = path.resolve(fileURLToPath(import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  seedOrganizer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
