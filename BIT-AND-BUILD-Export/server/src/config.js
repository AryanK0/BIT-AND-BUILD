import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  FRONTEND_ORIGIN: z.string().url(),
  SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24),
  UPLOAD_DIR: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
}).strict();

export function loadConfig(environment = process.env) {
  const values = environmentSchema.parse({
    NODE_ENV: environment.NODE_ENV,
    DATABASE_URL: environment.DATABASE_URL,
    FRONTEND_ORIGIN: environment.FRONTEND_ORIGIN,
    SESSION_COOKIE_NAME: environment.SESSION_COOKIE_NAME,
    SESSION_TTL_HOURS: environment.SESSION_TTL_HOURS,
    UPLOAD_DIR: environment.UPLOAD_DIR,
    PORT: environment.PORT,
  });

  return {
    nodeEnv: values.NODE_ENV,
    databaseUrl: values.DATABASE_URL,
    frontendOrigin: values.FRONTEND_ORIGIN,
    sessionCookieName: values.SESSION_COOKIE_NAME,
    sessionTtlHours: values.SESSION_TTL_HOURS,
    uploadDir: values.UPLOAD_DIR,
    port: values.PORT,
  };
}

export { environmentSchema };
