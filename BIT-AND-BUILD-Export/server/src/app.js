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

function safeResponseForStatus(status) {
  if (status === 400) {
    return {
      error: {
        code: 'BAD_REQUEST',
        message: 'Request could not be processed',
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
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    return error.statusCode;
  }
  return 500;
}

function logError(logger, error, req, status) {
  if (!logger || typeof logger.error !== 'function') return;

  // Keep logs useful for operations without ever serializing request data,
  // headers, query strings, raw error messages, or stack traces.
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
  app.use(cors({
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
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }));

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post('/api/scores', async (req, res, next) => {
    try {
      requirePool(pool);
      const payload = scoreRequestSchema.parse(req.body);
      const score = toDatabaseScore(payload);
      const result = await pool.query(
        `INSERT INTO scores (
          team_id, judge_email, innovation, technical, design, presentation,
          completeness, technical_execution, innovation_creativity,
          applicability_scalability, ui_ux, bonus_features, work_distribution,
          weighted_scores, final_score, comments
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (team_id, judge_email) DO UPDATE SET
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
      res.status(200).json({ score: result.rows[0] });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/teams/:teamId/scores', async (req, res, next) => {
    try {
      requirePool(pool);
      const result = await pool.query(
        'SELECT * FROM scores WHERE team_id = $1 ORDER BY created_at DESC',
        [req.params.teamId],
      );
      res.status(200).json({ scores: result.rows });
    } catch (error) {
      next(error);
    }
  });

  app.use((_req, res) => {
    res.status(404).json(safeResponseForStatus(404));
  });

  app.use((error, req, res, _next) => {
    if (res.headersSent) return;

    const status = errorStatus(error);
    logError(logger, error, req, status);
    res.status(status).json(safeResponseForStatus(status));
  });

  return app;
}
