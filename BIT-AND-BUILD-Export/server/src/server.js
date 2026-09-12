import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Pool } from 'pg';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

export function startServer({ environment = process.env, logger = console } = {}) {
  const config = loadConfig(environment);
  const pool = new Pool({ connectionString: config.databaseUrl });
  const app = createApp({ pool, config, logger });
  const server = app.listen(config.port, () => {
    logger.log(`API listening on port ${config.port}`);
  });

  const shutdown = async (signal) => {
    logger.log(`${signal} received; shutting down`);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  return { app, pool, server };
}

const entrypoint = process.argv[1] && path.resolve(process.argv[1]);
const currentFile = path.resolve(fileURLToPath(import.meta.url));

if (entrypoint === currentFile) {
  startServer();
}
