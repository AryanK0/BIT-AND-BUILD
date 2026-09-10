import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(currentDirectory, '../../migrations');

export function assertTestDatabaseUrl({ testDatabaseUrl, deploymentDatabaseUrl }) {
  if (!testDatabaseUrl || testDatabaseUrl === deploymentDatabaseUrl) {
    throw new Error('Test database URL must not match the deployment database URL');
  }
}

export async function runMigrations({ databaseUrl, migrationsDir = migrationsDirectory } = {}) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query('BEGIN');
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (applied.rowCount > 0) continue;
      await pool.query(await fs.readFile(path.join(migrationsDir, file), 'utf8'));
      await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    }
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentDirectory, 'migrate.js')) {
  runMigrations({ databaseUrl: process.env.DATABASE_URL })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
