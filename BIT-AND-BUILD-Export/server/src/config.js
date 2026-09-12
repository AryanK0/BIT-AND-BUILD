import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  FRONTEND_ORIGIN: z.string().url(),
  SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24),
  UPLOAD_DIR: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  ORGANIZER_EMAIL: z.string().email().default('admin@bitandbuild.com'),
  ORGANIZER_PASSWORD: z.string().min(8).default('organizer2026'),
  JUDGE_ID: z.string().min(3).default('JUDGE-001'),
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  RESEND_SENDER_EMAIL: z.string().trim().email().optional(),
  RESEND_SENDER_NAME: z.string().trim().min(1).max(160).default('BIT AND BUILD'),
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
    ORGANIZER_EMAIL: environment.ORGANIZER_EMAIL,
    ORGANIZER_PASSWORD: environment.ORGANIZER_PASSWORD,
    JUDGE_ID: environment.JUDGE_ID,
    RESEND_API_KEY: environment.RESEND_API_KEY,
    RESEND_SENDER_EMAIL: environment.RESEND_SENDER_EMAIL,
    RESEND_SENDER_NAME: environment.RESEND_SENDER_NAME,
  });

  return {
    nodeEnv: values.NODE_ENV,
    databaseUrl: values.DATABASE_URL,
    frontendOrigin: values.FRONTEND_ORIGIN,
    sessionCookieName: values.SESSION_COOKIE_NAME,
    sessionTtlHours: values.SESSION_TTL_HOURS,
    uploadDir: values.UPLOAD_DIR,
    port: values.PORT,
    organizerEmail: values.ORGANIZER_EMAIL,
    organizerPassword: values.ORGANIZER_PASSWORD,
    judgeId: values.JUDGE_ID,
    resendApiKey: values.RESEND_API_KEY,
    resendSenderEmail: values.RESEND_SENDER_EMAIL,
    resendSenderName: values.RESEND_SENDER_NAME,
  };
}

export { environmentSchema };
