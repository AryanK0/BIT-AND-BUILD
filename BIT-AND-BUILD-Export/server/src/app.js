import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { scoreRequestSchema, toDatabaseScore } from './scoring.js';

const genericError = {
  error: {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
  },
};

// In-memory authentication state.
// Judge OTP is intentionally NOT time-based.
// It becomes invalid immediately after successful Judge login.
let pendingJudgePasswordHash = null;

const sessions = new Map();

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateJudgePassword() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

function safeResponseForStatus(status) {
  if (status === 400) {
    return {
      error: {
        code: 'BAD_REQUEST',
        message: 'Request could not be processed',
      },
    };
  }

  if (status === 401) {
    return {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    };
  }

  if (status === 403) {
    return {
      error: {
        code: 'FORBIDDEN',
        message: 'Request is not allowed',
      },
    };
  }

  if (status === 404) {
    return {
      error: {
        code: 'NOT_FOUND',
        message: 'Not found',
      },
    };
  }

  if (status === 429) {
    return {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
      },
    };
  }

  return genericError;
}

function errorStatus(error) {
  if (error?.type === 'entity.parse.failed') return 400;
  if (error?.name === 'ZodError') return 400;

  if (
    Number.isInteger(error?.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  ) {
    return error.statusCode;
  }

  return 500;
}

function logError(logger, error, req, status) {
  if (!logger || typeof logger.error !== 'function') return;

  logger.error({
    event: 'http_error',
    status,
    method: req.method,
    path: req.path,
    errorType: error?.name || 'Error',
  });
}

function requirePool(pool) {
  if (!pool || typeof pool.query !== 'function') {
    const error = new Error('Database unavailable');
    error.statusCode = 503;
    throw error;
  }
}

function getSession(req) {
  const token = req.cookies?.session;

  if (!token) return null;

  return sessions.get(token) || null;
}

function requireAuth(req, res, next) {
  const session = getSession(req);

  if (!session) {
    return res.status(401).json(safeResponseForStatus(401));
  }

  req.session = session;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    const session = getSession(req);

    if (!session) {
      return res.status(401).json(safeResponseForStatus(401));
    }

    if (session.role !== role) {
      return res.status(403).json(safeResponseForStatus(403));
    }

    req.session = session;
    next();
  };
}

function setSessionCookie(res, token, config) {
  res.cookie('session', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionTtlHours * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie('session', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
}

export function createApp({ pool, config, logger = console } = {}) {
  if (!config) {
    throw new Error('Server configuration is required');
  }

  const app = express();

  app.disable('x-powered-by');

  app.locals.pool = pool;
  app.locals.config = config;
  app.locals.logger = logger;

  if (config.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(helmet());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || origin === config.frontendOrigin) {
          callback(null, true);
          return;
        }

        const error = new Error('Origin denied');
        error.statusCode = 403;
        callback(error);
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  // ============================================================
  // HEALTH
  // ============================================================

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // ============================================================
  // AUTH: ORGANIZER LOGIN
  // ============================================================

  app.post('/api/auth/organizer/login', (req, res) => {
    const { email, password } = req.body || {};

    if (
      email !== config.organizerEmail ||
      password !== config.organizerPassword
    ) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid organizer credentials',
        },
      });
    }

    const token = createToken();

    sessions.set(token, {
      role: 'organizer',
      email: config.organizerEmail,
      createdAt: Date.now(),
    });

    setSessionCookie(res, token, config);

    res.status(200).json({
      user: {
        role: 'organizer',
        email: config.organizerEmail,
      },
    });
  });

  // ============================================================
  // AUTH: ORGANIZER GENERATES JUDGE PASSWORD
  // ============================================================

  app.post(
    '/api/auth/judge/generate-password',
    requireRole('organizer'),
    (_req, res) => {
      const password = generateJudgePassword();

      pendingJudgePasswordHash = hash(password);

      res.status(200).json({
        judgeId: config.judgeId,
        password,
      });
    },
  );

  // ============================================================
  // AUTH: JUDGE LOGIN
  // ============================================================

  app.post('/api/auth/judge/login', (req, res) => {
    const { judgeId, password } = req.body || {};

    if (judgeId !== config.judgeId) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid Judge credentials',
        },
      });
    }

    if (!pendingJudgePasswordHash) {
      return res.status(401).json({
        error: {
          code: 'NO_PASSWORD',
          message: 'No Judge password has been generated',
        },
      });
    }

    const suppliedHash = hash(String(password || ''));

    if (suppliedHash !== pendingJudgePasswordHash) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid Judge password',
        },
      });
    }

    // IMPORTANT:
    // Password is immediately consumed.
    // It cannot be reused for another login.
    pendingJudgePasswordHash = null;

    const token = createToken();

    sessions.set(token, {
      role: 'judge',
      judgeId: config.judgeId,
      email: `${config.judgeId.toLowerCase()}@bitandbuild.com`,
      createdAt: Date.now(),
    });

    setSessionCookie(res, token, config);

    res.status(200).json({
      user: {
        role: 'judge',
        judgeId: config.judgeId,
        email: `${config.judgeId.toLowerCase()}@bitandbuild.com`,
      },
    });
  });

  // ============================================================
  // AUTH: CURRENT USER
  // ============================================================

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.status(200).json({
      user: req.session,
    });
  });

  // ============================================================
  // AUTH: LOGOUT
  // ============================================================

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    const token = req.cookies?.session;

    if (token) {
      sessions.delete(token);
    }

    clearSessionCookie(res);

    res.status(200).json({
      success: true,
    });
  });

  // ============================================================
  // SCORES
  // ONLY JUDGE CAN SUBMIT SCORES
  // ============================================================

  app.post(
    '/api/scores',
    requireRole('judge'),
    async (req, res, next) => {
      try {
        requirePool(pool);

        const payload = scoreRequestSchema.parse(req.body);

        // Never trust judge identity from the browser.
        const score = toDatabaseScore({
          ...payload,
          judgeEmail: req.session.email,
        });

        const result = await pool.query(
          `INSERT INTO scores (
            team_id,
            judge_email,
            innovation,
            technical,
            design,
            presentation,
            completeness,
            technical_execution,
            innovation_creativity,
            applicability_scalability,
            ui_ux,
            bonus_features,
            work_distribution,
            weighted_scores,
            final_score,
            comments
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16
          )
          ON CONFLICT (team_id, judge_email)
          DO UPDATE SET
            innovation = EXCLUDED.innovation,
            technical = EXCLUDED.technical,
            design = EXCLUDED.design,
            presentation = EXCLUDED.presentation,
            completeness = EXCLUDED.completeness,
            technical_execution = EXCLUDED.technical_execution,
            innovation_creativity = EXCLUDED.innovation_creativity,
            applicability_scalability = EXCLUDED.applicability_scalability,
            ui_ux = EXCLUDED.ui_ux,
            bonus_features = EXCLUDED.bonus_features,
            work_distribution = EXCLUDED.work_distribution,
            weighted_scores = EXCLUDED.weighted_scores,
            final_score = EXCLUDED.final_score,
            comments = EXCLUDED.comments
          RETURNING *`,
          [
            score.teamId,
            score.judgeEmail,
            score.innovationCreativity,
            score.technicalExecution,
            score.uiUx,
            score.presentation,
            score.completeness,
            score.technicalExecution,
            score.innovationCreativity,
            score.applicabilityScalability,
            score.uiUx,
            score.bonusFeatures,
            score.workDistribution,
            score.weightedScores,
            score.finalScore,
            score.comments,
          ],
        );

        res.status(200).json({
          score: result.rows[0],
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ============================================================
  // TEAM SCORES
  // JUDGE / ORGANIZER ONLY
  // ============================================================

  app.get(
    '/api/teams/:teamId/scores',
    requireAuth,
    async (req, res, next) => {
      try {
        requirePool(pool);

        const result = await pool.query(
          'SELECT * FROM scores WHERE team_id = $1 ORDER BY created_at DESC',
          [req.params.teamId],
        );

        res.status(200).json({
          scores: result.rows,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ============================================================
  // 404
  // ============================================================

  app.use((_req, res) => {
    res.status(404).json(safeResponseForStatus(404));
  });

  // ============================================================
  // ERROR HANDLER
  // ============================================================

  app.use((error, req, res, _next) => {
    if (res.headersSent) return;

    const status = errorStatus(error);

    logError(logger, error, req, status);

    res.status(status).json(safeResponseForStatus(status));
  });

  return app;
}