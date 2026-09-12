import argon2 from 'argon2';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { createSession, deleteSession, getSession } from './auth/sessions.js';
import { calculatePresentationEvaluation, presentationEvaluationSchema, scoreRequestSchema, toDatabaseScore } from './scoring.js';
import { decryptRecoverablePassword, encryptRecoverablePassword } from './security/teamCredentialRecovery.js';

const registerTeam = z.object({ teamName: z.string().trim().min(1).max(160), leaderName: z.string().trim().min(1).max(160), leaderEmail: z.string().trim().email(), college: z.string().trim().max(160).optional().or(z.literal('')), teamColour: z.string().trim().min(1).max(40).optional().or(z.literal('')), loginName: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9-]+$/), password: z.string().min(8).max(256) }).strict();
const googleSheetImport = z.object({ sheetUrl: z.string().trim().url().max(2048) }).strict();
const participantLogin = z.object({ identifier: z.string().trim().min(1).max(80), password: z.string().min(1).max(256) }).strict();
const problemStatement = z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(10000), isActive: z.boolean().optional() }).strict();
const submission = z.object({ problemStatementId: z.string().uuid(), projectTitle: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(10000), techStack: z.string().trim().max(1000).optional().or(z.literal('')), repositoryUrl: z.string().url().max(2048).optional().or(z.literal('')), deployedUrl: z.string().url().max(2048).optional().or(z.literal('')), status: z.enum(['draft', 'submitted', 'final']).optional() }).strict();
const announcement = z.object({ title: z.string().trim().min(1).max(200), content: z.string().trim().min(1).max(10000), priority: z.enum(['normal', 'important', 'urgent']).optional() }).strict();
const teamMember = z.object({ name: z.string().trim().min(1).max(160), email: z.string().trim().email().max(320).optional().or(z.literal('')), role: z.string().trim().max(80).optional().or(z.literal('')) }).strict();
const MAX_TEAM_SIZE = 4;
const JUDGE_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PRESENTATION_EXTENSIONS = new Set(['.ppt', '.pptx']);
const PRESENTATION_MIME_TYPES = new Set(['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']);
const norm = (value) => value.trim().toLowerCase();
const isEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const normalizeTeamName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const IMPORT_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
export function generateImportedPassword() { return Array.from({ length: 16 }, () => IMPORT_PASSWORD_ALPHABET[crypto.randomInt(IMPORT_PASSWORD_ALPHABET.length)]).join(''); }
const normalizedColumn = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const importedLoginName = (teamName) => `${String(teamName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 68) || 'team'}-${crypto.randomBytes(4).toString('hex')}`;
const normalizedMemberName = (value) => String(value || '').trim().replace(/\s+/g, ' ');
export function importedMembers(fields, leaderName) {
  const ignored = new Set(['', '-', '—', 'n/a', 'na', 'none', 'nil']);
  const leaderKey = normalizedMemberName(leaderName).toLowerCase();
  const seen = new Set([leaderKey]);
  return Object.entries(fields)
    .filter(([key]) => key === 'members' || key === 'member' || key === 'teammembers' || /^member\d+$/.test(key))
    .flatMap(([, value]) => String(value || '').split(/[;,|\n\r]+/))
    .map(normalizedMemberName)
    .filter((name) => {
      const key = name.toLowerCase();
      if (ignored.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
const errors = { 400: ['BAD_REQUEST', 'Request could not be processed'], 401: ['UNAUTHORIZED', 'Invalid login credentials'], 403: ['FORBIDDEN', 'Request is not allowed'], 404: ['NOT_FOUND', 'Not found'], 409: ['CONFLICT', 'Team name or login name already exists'], 429: ['RATE_LIMITED', 'Too many requests'], 503: ['SERVICE_UNAVAILABLE', 'Service temporarily unavailable'] };
function fail(status) { const [code, message] = errors[status] || ['INTERNAL_ERROR', 'Internal server error']; return { error: { code, message } }; }
function errorStatus(error) { if (error?.name === 'ZodError' || error?.type === 'entity.parse.failed' || error?.name === 'MulterError') return 400; if (error?.code === 'EACCES' || error?.code === 'EROFS' || error?.code === 'ENOSPC') return 503; if (error?.code === '23505') return 409; return Number.isInteger(error?.statusCode) ? error.statusCode : 500; }
function safeErrorMessage(error) { return String(error?.message || '').replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '[redacted-database-url]').replace(/(?:DATABASE_URL|api[_ -]?key)\s*[:=]\s*\S+/gi, (match) => `${match.split(/[:=]/)[0]}=[redacted]`).replace(/\b(?:re|sk)_[A-Za-z0-9_-]+/g, '[redacted-token]').replace(/password\s*[:=]\s*\S+/gi, 'password=[redacted]').slice(0, 500); }
function requirePool(pool) { if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') { const error = new Error('Database unavailable'); error.statusCode = 503; throw error; } }
function cookieOptions(config) { return { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: config.nodeEnv === 'production' ? 'none' : 'lax', path: '/', maxAge: config.sessionTtlHours * 3600000 }; }
function userDto(user) { return { id: user.id, email: user.email, name: user.name || user.display_name, role: user.role, ...(user.teamId || user.team_id ? { teamId: user.teamId || user.team_id } : {}) }; }
async function serviceUser(pool, { email, name, role, password }) {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  return (await pool.query(`INSERT INTO users (email, display_name, role, password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO UPDATE SET display_name=EXCLUDED.display_name, role=EXCLUDED.role, password_hash=EXCLUDED.password_hash, enabled=TRUE, updated_at=NOW() RETURNING id,email,display_name,role,team_id`, [norm(email), name, role, passwordHash])).rows[0];
}
function mapTeam(row) { return { id: row.id, team_name: row.team_name, leader_name: row.leader_name, leader_email: row.leader_email, college: row.college, team_colour: row.team_colour, login_name: row.login_name, created_at: row.created_at, updated_at: row.updated_at, project_title: row.project_title, project_description: row.project_description, tech_stack: row.tech_stack, github_link: row.github_link, demo_link: row.demo_link, submission_status: row.submission_status || 'not_submitted', presentation: row.presentation || null, team_members: row.team_members || [], scores: row.scores || [] }; }
export function generateJudgePassword() { return Array.from({ length: 6 }, () => JUDGE_PASSWORD_ALPHABET[crypto.randomInt(JUDGE_PASSWORD_ALPHABET.length)]).join(''); }
export function isAllowedPresentationFile(file) { return Boolean(file) && PRESENTATION_EXTENSIONS.has(path.extname(file.originalname || '').toLowerCase()) && PRESENTATION_MIME_TYPES.has(file.mimetype); }
function safePresentationName(filename) { return path.basename(filename).replace(/[^A-Za-z0-9._() -]/g, '_'); }

export function createApp({ pool, config, logger = console } = {}) {
  if (!config) throw new Error('Server configuration is required');
  const app = express(); app.disable('x-powered-by'); if (config.nodeEnv === 'production') app.set('trust proxy', 1);
  app.use(helmet()); app.use(cors({ origin: (origin, callback) => { if (!origin || origin === config.frontendOrigin) return callback(null, true); const error = new Error('Origin denied'); error.statusCode = 403; return callback(error); }, credentials: true })); app.use(express.json({ limit: '100kb' })); app.use(cookieParser()); app.use(rateLimit({ windowMs: 900000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));
  const presentationUpload = multer({ storage: multer.diskStorage({ destination: (_req, _file, callback) => fs.mkdir(config.uploadDir, { recursive: true }, (error) => callback(error, config.uploadDir)), filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`) }), limits: { fileSize: 20 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, callback) => { if (isAllowedPresentationFile(file)) return callback(null, true); const error = new Error('Only PPT and PPTX files are allowed'); error.statusCode = 400; return callback(error); } });
  const teamImportUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, callback) => { if (/\.(xlsx|xls)$/i.test(file.originalname || '')) return callback(null, true); const error = new Error('Only .xlsx or .xls team import files are allowed'); error.statusCode = 400; return callback(error); } });
  async function auth(req, res, next) { try { requirePool(pool); let token = req.cookies?.[config.sessionCookieName]; if (!token && req.headers.authorization?.startsWith('Bearer ')) token = req.headers.authorization.substring(7); const session = await getSession(pool, token); if (!session) return res.status(401).json(fail(401)); req.session = session; next(); } catch (error) { next(error); } }
  const role = (...roles) => [auth, (req, res, next) => roles.includes(req.session.role) ? next() : res.status(403).json(fail(403))];
  async function establish(res, user) { const token = await createSession(pool, user, config.sessionTtlHours); res.cookie(config.sessionCookieName, token, cookieOptions(config)); res.json({ user: userDto(user), token }); }

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/api/auth/organizer/login', async (req, res, next) => { try { if (norm(String(req.body?.email || '')) !== norm(config.organizerEmail) || req.body?.password !== config.organizerPassword) return res.status(401).json(fail(401)); requirePool(pool); const user = await serviceUser(pool, { email: config.organizerEmail, name: 'Organizer', role: 'organizer', password: config.organizerPassword }); await establish(res, user); } catch (error) { next(error); } });
  async function issueJudgePassword(client, judge) {
    const password = generateJudgePassword();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await client.query("UPDATE judges SET password_hash=$1,credential_status='pending',credential_issued_at=NOW(),updated_at=NOW() WHERE id=$2", [passwordHash, judge.id]);
    await client.query('DELETE FROM sessions WHERE user_id=$1', [judge.user_id]);
    return password;
  }
  async function createJudge(client) {
    const number = (await client.query("SELECT nextval('judge_public_id_seq') AS value")).rows[0].value;
    const judgeId = `JUDGE-${String(number).padStart(3, '0')}`;
    const email = `${judgeId.toLowerCase()}@judges.bitandbuild.local`;
    const internalPassword = await argon2.hash(crypto.randomBytes(32).toString('hex'), { type: argon2.argon2id });
    const user = (await client.query("INSERT INTO users (email,display_name,role,password_hash) VALUES ($1,$2,'judge',$3) RETURNING id,email,display_name,role", [email, judgeId, internalPassword])).rows[0];
    const judge = (await client.query("INSERT INTO judges (user_id,judge_id) VALUES ($1,$2) RETURNING id,user_id,judge_id,credential_status", [user.id, judgeId])).rows[0];
    return { judge, user };
  }
  const legacyJudgePassword = async (req, res, next) => { let client; try { requirePool(pool); client = await pool.connect(); await client.query('BEGIN'); let judge = (await client.query('SELECT id,user_id,judge_id FROM judges WHERE judge_id=$1 FOR UPDATE', [req.body?.judgeId || config.judgeId])).rows[0]; if (!judge) ({ judge } = await createJudge(client)); const password = await issueJudgePassword(client, judge); await client.query('COMMIT'); res.json({ judgeId: judge.judge_id, password }); } catch (error) { if (client) await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client?.release(); } };
  app.post('/api/auth/judge/generate-password', ...role('organizer'), legacyJudgePassword);
  app.post('/api/auth/judge/password', ...role('organizer'), legacyJudgePassword);
  app.post('/api/admin/judges', ...role('organizer'), async (_req, res, next) => { let client; try { requirePool(pool); client = await pool.connect(); await client.query('BEGIN'); const { judge } = await createJudge(client); const password = await issueJudgePassword(client, judge); await client.query('COMMIT'); res.status(201).json({ judge: { id: judge.id, judgeId: judge.judge_id, credentialStatus: 'pending' }, password }); } catch (error) { if (client) await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client?.release(); } });
  app.get('/api/admin/judges', ...role('organizer'), async (_req, res, next) => { try { const result = await pool.query(`SELECT j.id,j.judge_id,j.credential_status,j.credential_issued_at,j.last_login_at,j.created_at,COALESCE(json_agg(json_build_object('teamId',sc.team_id,'teamName',t.team_name,'score',sc.final_score,'scoredAt',sc.updated_at) ORDER BY sc.updated_at DESC) FILTER (WHERE sc.id IS NOT NULL),'[]'::json) AS scores FROM judges j LEFT JOIN scores sc ON sc.judge_id=j.user_id LEFT JOIN teams t ON t.id=sc.team_id GROUP BY j.id ORDER BY j.created_at ASC`); res.json({ judges: result.rows.map((judge) => ({ id: judge.id, judgeId: judge.judge_id, credentialStatus: judge.credential_status, credentialIssuedAt: judge.credential_issued_at, lastLoginAt: judge.last_login_at, createdAt: judge.created_at, scores: judge.scores })) }); } catch (error) { next(error); } });
  app.post('/api/admin/judges/:judgeId/regenerate-password', ...role('organizer'), async (req, res, next) => { let client; try { requirePool(pool); client = await pool.connect(); await client.query('BEGIN'); const judge = (await client.query('SELECT id,user_id,judge_id FROM judges WHERE judge_id=$1 FOR UPDATE', [req.params.judgeId])).rows[0]; if (!judge) { await client.query('ROLLBACK'); return res.status(404).json(fail(404)); } const password = await issueJudgePassword(client, judge); await client.query('COMMIT'); res.json({ judgeId: judge.judge_id, password }); } catch (error) { if (client) await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client?.release(); } });
  app.post('/api/auth/judge/login', async (req, res, next) => { let client; try { const judgeId = String(req.body?.judgeId || '').trim().toUpperCase(); if (!judgeId) return res.status(401).json(fail(401)); requirePool(pool); client = await pool.connect(); await client.query('BEGIN'); const judge = (await client.query(`SELECT j.id AS judge_account_id,j.judge_id,j.password_hash,j.credential_status,u.id,u.email,u.display_name,u.role FROM judges j JOIN users u ON u.id=j.user_id WHERE j.judge_id=$1 AND u.enabled=TRUE FOR UPDATE`, [judgeId])).rows[0]; if (!judge || judge.credential_status !== 'pending' || !judge.password_hash || !(await argon2.verify(judge.password_hash, String(req.body?.password || '')))) { await client.query('ROLLBACK'); return res.status(401).json(fail(401)); } await client.query("UPDATE judges SET password_hash=NULL,credential_status='consumed',last_login_at=NOW(),updated_at=NOW() WHERE id=$1", [judge.judge_account_id]); await client.query('COMMIT'); await establish(res, { id: judge.id, email: judge.email, name: judge.display_name, role: judge.role }); } catch (error) { if (client) await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client?.release(); } });
  app.post('/api/auth/participant/login', async (req, res, next) => { try { const input = participantLogin.parse(req.body); requirePool(pool); const result = await pool.query(`SELECT c.team_id,c.password_hash,u.id,u.email,u.display_name,u.enabled FROM team_credentials c JOIN users u ON u.team_id=c.team_id AND u.role='participant' WHERE c.login_name=$1`, [norm(input.identifier)]); const record = result.rows[0]; if (!record || !record.enabled || !(await argon2.verify(record.password_hash, input.password))) return res.status(401).json(fail(401)); await establish(res, { id: record.id, email: record.email, name: record.display_name, role: 'participant', teamId: record.team_id }); } catch (error) { next(error); } });
  app.get('/api/auth/me', auth, (req, res) => res.json({ user: userDto(req.session) }));
  app.post('/api/auth/logout', auth, async (req, res, next) => { try { await deleteSession(pool, req.cookies?.[config.sessionCookieName]); const { maxAge, ...options } = cookieOptions(config); res.clearCookie(config.sessionCookieName, options); res.json({ success: true }); } catch (error) { next(error); } });

  app.post('/api/teams', ...role('organizer'), async (req, res, next) => {
    let client;
    let committed = false;
    let stage = 'request_validation';
    try {
      const input = registerTeam.parse(req.body);
      stage = 'database_connect';
      requirePool(pool);
      client = await pool.connect();
      stage = 'transaction_begin';
      await client.query('BEGIN');
      stage = 'password_hash';
      const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
      stage = 'insert_team';
      const team = (await client.query('INSERT INTO teams (team_name,leader_name,leader_email,college,team_colour) VALUES ($1,$2,$3,$4,$5) RETURNING *', [input.teamName, input.leaderName, norm(input.leaderEmail), input.college || null, input.teamColour || null])).rows[0];
      stage = 'insert_team_member';
      await client.query("INSERT INTO team_members (team_id,name,email,role) VALUES ($1,$2,$3,'Leader')", [team.id, input.leaderName, norm(input.leaderEmail)]);
      stage = 'insert_participant';
      await client.query("INSERT INTO users (email,display_name,role,password_hash,team_id) VALUES ($1,$2,'participant',$3,$4)", [norm(input.leaderEmail), input.leaderName, passwordHash, team.id]);
      const loginName = norm(input.loginName);
      stage = 'insert_team_credentials';
      // Recovery is deliberately optional so normal registration still works before
      // the Admin configures a recovery key.  The password hash remains the only
      // value used by participant authentication.
      const encryptedPassword = config.teamCredentialEncryptionKey
        ? encryptRecoverablePassword(input.password, config.teamCredentialEncryptionKey)
        : null;
      await client.query('INSERT INTO team_credentials (team_id,login_name,password_hash,encrypted_password) VALUES ($1,$2,$3,$4)', [team.id, loginName, passwordHash, encryptedPassword]);
      stage = 'transaction_commit';
      await client.query('COMMIT');
      committed = true;

      res.status(201).json({ team: { id: team.id, teamName: team.team_name, leaderName: team.leader_name, leaderEmail: team.leader_email, college: team.college }, credentials: { loginName } });
    } catch (error) {
      if (client && !committed) await client.query('ROLLBACK').catch((rollbackError) => logger.error?.({ event: 'team_registration_rollback_error', errorType: rollbackError?.name || 'Error', errorMessage: safeErrorMessage(rollbackError) }));
      logger.error?.({ event: 'team_registration_error', stage, errorType: error?.name || 'Error', errorCode: error?.code, errorMessage: safeErrorMessage(error) });
      next(error);
    } finally {
      client?.release();
    }
  });
  const teamSelectBase = `SELECT t.*,s.title project_title,s.description project_description,s.tech_stack,s.github_url github_link,s.demo_url demo_link,COALESCE(s.status,'not_submitted') submission_status,(SELECT json_build_object('originalFilename',p.original_filename,'uploadedAt',p.uploaded_at) FROM presentations p WHERE p.team_id=t.id) presentation,COALESCE((SELECT json_agg(json_build_object('id',m.id,'member_name',m.name,'member_email',m.email,'member_role',m.role)) FROM team_members m WHERE m.team_id=t.id),'[]'::json) team_members`;
  const teamSelect = `${teamSelectBase},c.login_name,COALESCE((SELECT json_agg(sc ORDER BY sc.created_at DESC) FROM scores sc WHERE sc.team_id=t.id),'[]'::json) scores FROM teams t LEFT JOIN submissions s ON s.team_id=t.id LEFT JOIN team_credentials c ON c.team_id=t.id`;
  const participantTeamSelect = `${teamSelectBase},c.login_name,'[]'::json AS scores FROM teams t LEFT JOIN submissions s ON s.team_id=t.id LEFT JOIN team_credentials c ON c.team_id=t.id`;
  app.get('/api/teams', ...role('organizer'), async (_req, res, next) => { try { const result = await pool.query(`${teamSelect} ORDER BY t.created_at DESC`); res.json({ teams: result.rows.map(mapTeam) }); } catch (error) { next(error); } });
  // A compact, judge-safe aggregate is intentionally separate from the richer
  // team/submission view. COUNT always returns exactly one row, including zero.
  app.get('/api/judge/teams-summary', ...role('judge'), async (_req, res, next) => { try { const result = await pool.query('SELECT COUNT(*)::int AS team_count FROM teams'); res.json({ teamCount: result.rows[0]?.team_count ?? 0 }); } catch (error) { next(error); } });
  const importTeams = async (req, res, next) => { let client; try {
    if (!config.teamCredentialEncryptionKey) return res.status(503).json({ error: { code: 'TEAM_CREDENTIAL_ENCRYPTION_KEY_REQUIRED', message: 'Team import requires server-side credential encryption to be configured' } });
    if (!req.file?.buffer) return res.status(400).json(fail(400));
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', dense: false });
    const importSheet = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const values = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      const headerIndex = values.findIndex((row) => {
        const headers = row.map(normalizedColumn);
        return (headers.includes('teamname') || headers.includes('team')) && (headers.includes('teamleader') || headers.includes('leadername') || headers.includes('leader'));
      });
      return headerIndex >= 0 ? { sheet, headerIndex } : null;
    }).find(Boolean);
    if (!importSheet) return res.status(400).json({ error: { code: 'IMPORT_COLUMNS_NOT_FOUND', message: 'A sheet must contain Team Name and Team Leader or Leader Name columns' } });
    const rows = importSheet ? XLSX.utils.sheet_to_json(importSheet.sheet, { range: importSheet.headerIndex, defval: '', raw: false }) : [];
    const invalidRows = []; const candidates = []; const seen = new Set();
    rows.forEach((row, index) => {
      const fields = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizedColumn(key), String(value || '').trim()]));
      const teamName = fields.teamname || fields.team || '';
      const leaderName = fields.teamleader || fields.leadername || fields.leader || '';
      const leaderEmail = fields.leaderemail || fields.candidateemail || fields.email || '';
      const teamColour = fields.colour || fields.color || fields.pen || '';
      const nameKey = normalizeTeamName(teamName);
      const sourceRow = index + importSheet.headerIndex + 2;
      if (!teamName || !leaderName || teamName.length > 160 || leaderName.length > 160) return invalidRows.push({ row: sourceRow, reason: 'Team Name and Leader Name are required and must be at most 160 characters' });
      if (seen.has(nameKey)) return invalidRows.push({ row: sourceRow, reason: 'Duplicate team name in import file' });
      const normalizedLeaderName = normalizedMemberName(leaderName);
      seen.add(nameKey); candidates.push({ row: sourceRow, teamName: teamName.replace(/\s+/g, ' '), leaderName: normalizedLeaderName, leaderEmail: isEmail(leaderEmail) ? norm(leaderEmail) : null, teamColour: teamColour.replace(/\s+/g, ' ').slice(0, 40) || null, members: importedMembers(fields, normalizedLeaderName), nameKey });
    });
    requirePool(pool); client = await pool.connect(); await client.query('BEGIN');
    await client.query('LOCK TABLE teams IN SHARE ROW EXCLUSIVE MODE');
    const existing = new Set((await client.query('SELECT lower(trim(team_name)) AS team_name FROM teams')).rows.map((row) => normalizeTeamName(row.team_name)));
    const imported = []; const duplicates = [];
    for (const candidate of candidates) {
      if (existing.has(candidate.nameKey)) { duplicates.push({ row: candidate.row, teamName: candidate.teamName }); continue; }
      const loginName = importedLoginName(candidate.teamName); const password = generateImportedPassword(); const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const team = (await client.query('INSERT INTO teams (team_name,leader_name,leader_email,college,team_colour) VALUES ($1,$2,$3,$4,$5) RETURNING *', [candidate.teamName, candidate.leaderName, candidate.leaderEmail || `${loginName}@teams.bitandbuild.local`, null, candidate.teamColour])).rows[0];
      await client.query("INSERT INTO team_members (team_id,name,email,role) VALUES ($1,$2,$3,'Leader')", [team.id, candidate.leaderName, candidate.leaderEmail]);
      for (const memberName of candidate.members) {
        await client.query("INSERT INTO team_members (team_id,name,role) VALUES ($1,$2,'Member')", [team.id, memberName]);
      }
      await client.query("INSERT INTO users (email,display_name,role,password_hash,team_id) VALUES ($1,$2,'participant',$3,$4)", [candidate.leaderEmail || `${loginName}@teams.bitandbuild.local`, candidate.leaderName, passwordHash, team.id]);
      await client.query('INSERT INTO team_credentials (team_id,login_name,password_hash,encrypted_password) VALUES ($1,$2,$3,$4)', [team.id, loginName, passwordHash, encryptRecoverablePassword(password, config.teamCredentialEncryptionKey)]);
      existing.add(candidate.nameKey); imported.push({ teamId: team.id, teamName: team.team_name, leaderName: team.leader_name, loginName, memberCount: candidate.members.length + 1 });
    }
    await client.query('COMMIT'); logger.info?.({ event: 'team_import_completed', imported: imported.length, duplicates: duplicates.length, invalid: invalidRows.length });
    res.status(201).json({ totalRows: rows.length, imported, skippedDuplicates: duplicates, invalidRows });
  } catch (error) { if (client) await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client?.release(); } };
  app.post('/api/admin/teams/import', ...role('organizer'), teamImportUpload.single('file'), importTeams);
  app.post('/api/admin/teams/import-google-sheet', ...role('organizer'), async (req, res, next) => { try {
    const { sheetUrl } = googleSheetImport.parse(req.body);
    const source = new URL(sheetUrl);
    const match = source.hostname === 'docs.google.com' && source.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
    if (!match) return res.status(400).json({ error: { code: 'INVALID_GOOGLE_SHEET_URL', message: 'Provide a Google Sheets URL' } });
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`, { signal: AbortSignal.timeout(15000) });
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (!response.ok || contentLength > 5 * 1024 * 1024) return res.status(400).json({ error: { code: 'GOOGLE_SHEET_UNAVAILABLE', message: 'The Google Sheet must be publicly viewable and no larger than 5 MB' } });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) return res.status(400).json(fail(400));
    req.file = { buffer, originalname: 'google-sheet.xlsx' };
    return importTeams(req, res, next);
  } catch (error) { next(error); } });
  app.get('/api/admin/teams/:teamId/credentials', ...role('organizer'), async (req, res, next) => { try { if (!config.teamCredentialEncryptionKey) return res.status(503).json({ error: { code: 'CREDENTIAL_RECOVERY_NOT_CONFIGURED', message: 'Team credential recovery is not configured' } }); const record = (await pool.query('SELECT t.team_name,c.login_name,c.encrypted_password FROM teams t JOIN team_credentials c ON c.team_id=t.id WHERE t.id=$1', [req.params.teamId])).rows[0]; if (!record) return res.status(404).json(fail(404)); if (!record.encrypted_password) return res.status(409).json({ error: { code: 'CREDENTIAL_NOT_RECOVERABLE', message: 'This existing team password cannot be recovered securely' } }); const password = decryptRecoverablePassword(record.encrypted_password, config.teamCredentialEncryptionKey); logger.info?.({ event: 'team_credential_viewed', actorId: req.session.id, teamId: req.params.teamId }); res.json({ credentials: { loginName: record.login_name, password } }); } catch (error) { next(error); } });
  app.delete('/api/teams/:teamId', ...role('organizer'), async (req, res, next) => { let client; try { requirePool(pool); client = await pool.connect(); await client.query('BEGIN'); const team = (await client.query('SELECT id,team_name FROM teams WHERE id=$1 FOR UPDATE', [req.params.teamId])).rows[0]; if (!team) { await client.query('ROLLBACK'); return res.status(404).json(fail(404)); } /* Participant users must be removed before their team: the schema intentionally requires every participant to own a team. Sessions cascade from users; team members, credentials, submissions, and scores cascade from teams. */ await client.query("DELETE FROM users WHERE team_id=$1 AND role='participant'", [team.id]); await client.query('DELETE FROM teams WHERE id=$1', [team.id]); await client.query('COMMIT'); res.json({ deletedTeam: { id: team.id, teamName: team.team_name } }); } catch (error) { if (client) await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client?.release(); } });
  // Registration is confirmed from the current session's user record, not a
  // browser-provided team ID or a cached frontend value.  A participant can see
  // only the team to which that exact user is currently attached.
  app.get('/api/teams/me', ...role('participant'), async (req, res, next) => { try { const result = await pool.query(`${participantTeamSelect} JOIN users u ON u.team_id=t.id WHERE u.id=$1 AND u.role='participant'`, [req.session.id]); const row = result.rows[0]; res.json({ registered: Boolean(row), team: row ? mapTeam(row) : null }); } catch (error) { next(error); } });
  // Participant accounts represent a team login, so leadership is established by
  // matching the authenticated account to the registered leader email. Never use
  // a team ID supplied by the browser for these mutations.
  async function requireTeamLeader(req, res) {
    const result = await pool.query('SELECT id FROM teams WHERE id=$1 AND lower(leader_email)=lower($2)', [req.session.teamId, req.session.email]);
    if (!result.rows[0]) { res.status(403).json(fail(403)); return false; }
    return true;
  }
  app.post('/api/teams/me/members', ...role('participant'), async (req, res, next) => { try { const input = teamMember.parse(req.body); if (!(await requireTeamLeader(req, res))) return; const count = Number((await pool.query('SELECT COUNT(*)::int AS count FROM team_members WHERE team_id=$1', [req.session.teamId])).rows[0]?.count || 0); if (count >= MAX_TEAM_SIZE) return res.status(409).json({ error: { code: 'TEAM_FULL', message: `A team can have at most ${MAX_TEAM_SIZE} members` } }); const result = await pool.query("INSERT INTO team_members (team_id,name,email,role) VALUES ($1,$2,$3,$4) RETURNING id,name AS member_name,email AS member_email,role AS member_role", [req.session.teamId, input.name, input.email ? norm(input.email) : null, input.role || 'Member']); res.status(201).json({ member: result.rows[0] }); } catch (error) { next(error); } });
  app.delete('/api/teams/me/members/:memberId', ...role('participant'), async (req, res, next) => { try { if (!(await requireTeamLeader(req, res))) return; const result = await pool.query("DELETE FROM team_members WHERE id=$1 AND team_id=$2 AND role <> 'Leader' RETURNING id", [req.params.memberId, req.session.teamId]); if (!result.rows[0]) return res.status(404).json(fail(404)); res.status(204).end(); } catch (error) { next(error); } });
  const presentationMetadata = `SELECT id,team_id,original_filename,stored_filename,mime_type,uploaded_at,updated_at FROM presentations WHERE team_id=$1`;
  const sendPresentation = async (teamId, res, next) => { try { const presentation = (await pool.query(presentationMetadata, [teamId])).rows[0]; if (!presentation) return res.status(404).json(fail(404)); const storedPath = path.resolve(config.uploadDir, path.basename(presentation.stored_filename)); if (!storedPath.startsWith(path.resolve(config.uploadDir) + path.sep) || !fs.existsSync(storedPath)) return res.status(404).json(fail(404)); res.type(presentation.mime_type); res.setHeader('Content-Disposition', `inline; filename="${presentation.original_filename.replace(/["\\]/g, '')}"`); return res.sendFile(storedPath); } catch (error) { return next(error); } };
  app.get('/api/presentations/me', ...role('participant'), async (req, res, next) => { try { const presentation = (await pool.query(presentationMetadata, [req.session.teamId])).rows[0]; res.json({ presentation: presentation ? { originalFilename: presentation.original_filename, mimeType: presentation.mime_type, uploadedAt: presentation.uploaded_at } : null }); } catch (error) { next(error); } });
  app.post('/api/presentations', ...role('participant'), presentationUpload.single('presentation'), async (req, res, next) => { let client; try { if (!req.file) return res.status(400).json(fail(400)); requirePool(pool); client = await pool.connect(); await client.query('BEGIN'); const submissionRecord = (await client.query('SELECT status FROM submissions WHERE team_id=$1 FOR UPDATE', [req.session.teamId])).rows[0]; if (submissionRecord?.status === 'final') { await client.query('ROLLBACK'); fs.unlink(req.file.path, () => {}); return res.status(403).json(fail(403)); } const previous = (await client.query('SELECT stored_filename FROM presentations WHERE team_id=$1 FOR UPDATE', [req.session.teamId])).rows[0]; const result = await client.query(`INSERT INTO presentations (team_id,original_filename,stored_filename,mime_type) VALUES ($1,$2,$3,$4) ON CONFLICT (team_id) DO UPDATE SET original_filename=EXCLUDED.original_filename,stored_filename=EXCLUDED.stored_filename,mime_type=EXCLUDED.mime_type,uploaded_at=NOW(),updated_at=NOW() RETURNING original_filename,mime_type,uploaded_at`, [req.session.teamId, safePresentationName(req.file.originalname), req.file.filename, req.file.mimetype]); await client.query('COMMIT'); if (previous) fs.unlink(path.resolve(config.uploadDir, path.basename(previous.stored_filename)), () => {}); res.status(201).json({ presentation: { originalFilename: result.rows[0].original_filename, mimeType: result.rows[0].mime_type, uploadedAt: result.rows[0].uploaded_at } }); } catch (error) { if (client) await client.query('ROLLBACK').catch(() => {}); if (req.file) fs.unlink(req.file.path, () => {}); next(error); } finally { client?.release(); } });
  app.get('/api/presentations/me/file', ...role('participant'), (req, res, next) => sendPresentation(req.session.teamId, res, next));
  app.get('/api/admin/teams/:teamId/presentation', ...role('organizer'), (req, res, next) => sendPresentation(req.params.teamId, res, next));
  app.get('/api/judge/teams/:teamId/presentation', ...role('judge'), (req, res, next) => sendPresentation(req.params.teamId, res, next, true));
  app.get('/api/judge/presentations', ...role('judge'), async (req, res, next) => { try { const result = await pool.query(`SELECT t.id AS team_id,t.team_name,t.leader_name,COALESCE((SELECT json_agg(json_build_object('id',m.id,'member_name',m.name,'member_email',m.email,'member_role',m.role)) FROM team_members m WHERE m.team_id=t.id),'[]'::json) AS team_members,p.original_filename,p.mime_type,p.uploaded_at,ps.completeness,ps.technical_execution,ps.innovation_creativity,ps.applicability_scalability,ps.ui_ux,ps.bonus_features,ps.presentation,ps.work_distribution,ps.weighted_scores,ps.final_score,ps.comments,ps.updated_at AS scored_at FROM teams t LEFT JOIN presentations p ON p.team_id=t.id LEFT JOIN presentation_scores ps ON ps.team_id=t.id AND ps.judge_id=$1 ORDER BY p.uploaded_at DESC NULLS LAST,t.team_name ASC`, [req.session.id]); res.json({ presentations: result.rows }); } catch (error) { next(error); } });
  app.post('/api/judge/presentations/:teamId/score', ...role('judge'), async (req, res, next) => { try { const input = presentationEvaluationSchema.parse(req.body); const exists = (await pool.query('SELECT id FROM presentations WHERE team_id=$1', [req.params.teamId])).rows[0]; if (!exists) return res.status(404).json(fail(404)); const evaluation = calculatePresentationEvaluation(input); const values = [req.params.teamId, req.session.id, input.completeness, input.technical_execution, input.innovation_creativity, input.applicability_scalability, input.ui_ux, input.bonus_features, input.presentation, input.work_distribution, evaluation.weightedScores, evaluation.finalScore, input.comments]; const result = await pool.query(`INSERT INTO presentation_scores (team_id,judge_id,completeness,technical_execution,innovation_creativity,applicability_scalability,ui_ux,bonus_features,presentation,work_distribution,weighted_scores,final_score,comments) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (team_id,judge_id) DO UPDATE SET completeness=EXCLUDED.completeness,technical_execution=EXCLUDED.technical_execution,innovation_creativity=EXCLUDED.innovation_creativity,applicability_scalability=EXCLUDED.applicability_scalability,ui_ux=EXCLUDED.ui_ux,bonus_features=EXCLUDED.bonus_features,presentation=EXCLUDED.presentation,work_distribution=EXCLUDED.work_distribution,weighted_scores=EXCLUDED.weighted_scores,final_score=EXCLUDED.final_score,comments=EXCLUDED.comments,updated_at=NOW() RETURNING completeness,technical_execution,innovation_creativity,applicability_scalability,ui_ux,bonus_features,presentation,work_distribution,weighted_scores,final_score,comments,updated_at`, values); res.json({ presentationEvaluation: result.rows[0] }); } catch (error) { next(error); } });
  app.get('/api/problem-statements', auth, async (req, res, next) => { try { const result = await pool.query(`SELECT id,title,description,is_active,created_at,updated_at FROM problem_statements ${req.session.role === 'organizer' ? '' : 'WHERE is_active=TRUE'} ORDER BY created_at DESC`); res.json({ problemStatements: result.rows }); } catch (error) { next(error); } });
  app.post('/api/problem-statements', ...role('organizer'), async (req, res, next) => { try { const input = problemStatement.parse(req.body); const result = await pool.query('INSERT INTO problem_statements (title,description,is_active) VALUES ($1,$2,$3) RETURNING *', [input.title, input.description, input.isActive ?? true]); res.status(201).json({ problemStatement: result.rows[0] }); } catch (error) { next(error); } });
  app.put('/api/problem-statements/:id', ...role('organizer'), async (req, res, next) => { try { const input = problemStatement.parse(req.body); const result = await pool.query('UPDATE problem_statements SET title=$1,description=$2,is_active=$3,updated_at=NOW() WHERE id=$4 RETURNING *', [input.title, input.description, input.isActive ?? true, req.params.id]); if (!result.rows[0]) return res.status(404).json(fail(404)); res.json({ problemStatement: result.rows[0] }); } catch (error) { next(error); } });
  app.delete('/api/problem-statements/:id', ...role('organizer'), async (req, res, next) => { try { const result = await pool.query('DELETE FROM problem_statements WHERE id=$1 RETURNING id', [req.params.id]); if (!result.rows[0]) return res.status(404).json(fail(404)); res.status(204).end(); } catch (error) { next(error); } });
  const submissionSelect = `SELECT s.id,s.team_id,s.problem_statement_id,s.title,s.description,s.tech_stack,s.github_url AS repository_url,s.demo_url AS deployed_url,s.status,s.submitted_at,s.created_at,s.updated_at,t.team_name,t.leader_name,p.title AS problem_statement_title FROM submissions s JOIN teams t ON t.id=s.team_id LEFT JOIN problem_statements p ON p.id=s.problem_statement_id`;
  app.post('/api/submissions', ...role('participant'), async (req, res, next) => { try { const input = submission.parse(req.body); const result = await pool.query(`INSERT INTO submissions (team_id,problem_statement_id,title,description,tech_stack,github_url,demo_url,status,submitted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8='submitted' THEN NOW() ELSE NULL END) ON CONFLICT (team_id) DO UPDATE SET problem_statement_id=EXCLUDED.problem_statement_id,title=EXCLUDED.title,description=EXCLUDED.description,tech_stack=EXCLUDED.tech_stack,github_url=EXCLUDED.github_url,demo_url=EXCLUDED.demo_url,status=EXCLUDED.status,submitted_at=CASE WHEN EXCLUDED.status='submitted' THEN NOW() ELSE submissions.submitted_at END,updated_at=NOW() WHERE submissions.status <> 'final' RETURNING *`, [req.session.teamId,input.problemStatementId,input.projectTitle,input.description,input.techStack || null,input.repositoryUrl || null,input.deployedUrl || null,input.status || 'submitted']); if (!result.rows[0]) return res.status(403).json(fail(403)); res.status(201).json({ submission: result.rows[0] }); } catch (error) { next(error); } });
  app.get('/api/submissions/me', ...role('participant'), async (req, res, next) => { try { const result = await pool.query(`${submissionSelect} WHERE s.team_id=$1`, [req.session.teamId]); res.json({ submissions: result.rows }); } catch (error) { next(error); } });
  app.put('/api/submissions/:id', auth, async (req, res, next) => { try { const input = submission.parse(req.body); const isParticipant = req.session.role === 'participant'; if (!isParticipant && req.session.role !== 'organizer') return res.status(403).json(fail(403)); const values = [input.problemStatementId,input.projectTitle,input.description,input.techStack || null,input.repositoryUrl || null,input.deployedUrl || null,input.status || 'submitted',req.params.id]; const ownership = isParticipant ? ' AND team_id=$9 AND status <> \'final\'' : ''; if (isParticipant) values.push(req.session.teamId); const result = await pool.query(`UPDATE submissions SET problem_statement_id=$1,title=$2,description=$3,tech_stack=$4,github_url=$5,demo_url=$6,status=$7,submitted_at=CASE WHEN $7='submitted' THEN NOW() ELSE submitted_at END,updated_at=NOW() WHERE id=$8${ownership} RETURNING *`, values); if (!result.rows[0]) return res.status(404).json(fail(404)); res.json({ submission: result.rows[0] }); } catch (error) { next(error); } });
  app.get('/api/admin/submissions', ...role('organizer'), async (_req, res, next) => { try { const result = await pool.query(`${submissionSelect} ORDER BY s.updated_at DESC`); res.json({ submissions: result.rows }); } catch (error) { next(error); } });
  app.get('/api/judge/submissions', ...role('judge'), async (req, res, next) => { try { const result = await pool.query(`SELECT s.id,s.team_id,s.problem_statement_id,s.title,s.description,s.tech_stack,s.github_url AS repository_url,s.demo_url AS deployed_url,COALESCE(s.status,'not_submitted') AS status,s.submitted_at,s.created_at,s.updated_at,t.id AS registered_team_id,t.team_name,t.leader_name,(SELECT COUNT(*)::int FROM team_members m WHERE m.team_id=t.id) AS member_count,COALESCE((SELECT json_agg(json_build_object('id',m.id,'member_name',m.name,'member_email',m.email,'member_role',m.role)) FROM team_members m WHERE m.team_id=t.id),'[]'::json) AS team_members,p.title AS problem_statement_title,sc.id AS score_id,sc.completeness,sc.technical_execution,sc.innovation_creativity,sc.applicability_scalability,sc.ui_ux,sc.bonus_features,sc.presentation,sc.work_distribution,sc.weighted_scores,sc.final_score,sc.comments FROM teams t LEFT JOIN submissions s ON s.team_id=t.id LEFT JOIN problem_statements p ON p.id=s.problem_statement_id LEFT JOIN scores sc ON sc.team_id=t.id AND sc.judge_id=$1 ORDER BY t.created_at DESC`, [req.session.id]); res.json({ submissions: result.rows }); } catch (error) { next(error); } });
  app.post('/api/scores', ...role('judge'), async (req, res, next) => { try { const payload = scoreRequestSchema.parse(req.body); const submissionRecord = (await pool.query("SELECT id FROM submissions WHERE team_id=$1 AND status IN ('submitted','under_review','final')", [payload.team_id])).rows[0]; if (!submissionRecord) return res.status(404).json(fail(404)); const score = toDatabaseScore(payload); const values = [score.teamId,submissionRecord.id,req.session.id,req.session.email,score.innovationCreativity,score.technicalExecution,score.uiUx,score.presentation,score.completeness,score.technicalExecution,score.innovationCreativity,score.applicabilityScalability,score.uiUx,score.bonusFeatures,score.workDistribution,score.weightedScores,score.finalScore,score.comments]; const result = await pool.query(`INSERT INTO scores (team_id,submission_id,judge_id,judge_email,innovation,technical,design,presentation,completeness,technical_execution,innovation_creativity,applicability_scalability,ui_ux,bonus_features,work_distribution,weighted_scores,final_score,comments) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT (team_id,judge_email) DO UPDATE SET submission_id=EXCLUDED.submission_id,judge_id=EXCLUDED.judge_id,innovation=EXCLUDED.innovation,technical=EXCLUDED.technical,design=EXCLUDED.design,presentation=EXCLUDED.presentation,completeness=EXCLUDED.completeness,technical_execution=EXCLUDED.technical_execution,innovation_creativity=EXCLUDED.innovation_creativity,applicability_scalability=EXCLUDED.applicability_scalability,ui_ux=EXCLUDED.ui_ux,bonus_features=EXCLUDED.bonus_features,work_distribution=EXCLUDED.work_distribution,weighted_scores=EXCLUDED.weighted_scores,final_score=EXCLUDED.final_score,comments=EXCLUDED.comments,updated_at=NOW() RETURNING *`, values); res.json({ score: result.rows[0] }); } catch (error) { next(error); } });
  app.get('/api/admin/scores', ...role('organizer'), async (_req, res, next) => { try { const result = await pool.query(`SELECT sc.*,t.team_name,s.title AS submission_title FROM scores sc JOIN teams t ON t.id=sc.team_id LEFT JOIN submissions s ON s.id=sc.submission_id ORDER BY sc.updated_at DESC`); res.json({ scores: result.rows }); } catch (error) { next(error); } });
  app.get('/api/admin/judge-scoring', ...role('organizer'), async (req, res, next) => { try { const judgeId = typeof req.query.judgeId === 'string' ? req.query.judgeId.trim().toUpperCase() : ''; const result = await pool.query(`SELECT j.judge_id,t.id AS team_id,t.team_name,sc.final_score,sc.created_at,sc.updated_at FROM scores sc JOIN judges j ON j.user_id=sc.judge_id JOIN teams t ON t.id=sc.team_id WHERE ($1='' OR j.judge_id=$1) ORDER BY sc.updated_at DESC`, [judgeId]); res.json({ activity: result.rows.map((row) => ({ judgeId: row.judge_id, teamId: row.team_id, teamName: row.team_name, score: Number(row.final_score), scoredAt: row.updated_at, createdAt: row.created_at })) }); } catch (error) { next(error); } });
  app.get('/api/announcements', auth, async (_req, res, next) => { try { const result = await pool.query('SELECT id,title,content,priority,is_active,created_at,updated_at FROM announcements WHERE is_active=TRUE ORDER BY created_at DESC'); res.json({ announcements: result.rows }); } catch (error) { next(error); } });
  app.post('/api/announcements', ...role('organizer'), async (req, res, next) => { try { const input = announcement.parse(req.body); const result = await pool.query('INSERT INTO announcements (title,content,priority) VALUES ($1,$2,$3) RETURNING *', [input.title, input.content, input.priority || 'normal']); res.status(201).json({ announcement: result.rows[0] }); } catch (error) { next(error); } });
  app.delete('/api/announcements/:id', ...role('organizer'), async (req, res, next) => { try { const result = await pool.query('DELETE FROM announcements WHERE id=$1 RETURNING id', [req.params.id]); if (!result.rows[0]) return res.status(404).json(fail(404)); res.status(204).end(); } catch (error) { next(error); } });
  app.use((_req, res) => res.status(404).json(fail(404))); app.use((error, req, res, _next) => { if (res.headersSent) return; const status = errorStatus(error); logger.error?.({ event: 'http_error', status, method: req.method, path: req.path, errorType: error?.name || 'Error', errorCode: error?.code, errorMessage: safeErrorMessage(error) }); if (error?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: { code: 'FILE_TOO_LARGE', message: 'File is too large. The Round 1 limit is 20 MB.' } }); if (error?.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: { code: 'UNEXPECTED_FILE_FIELD', message: 'Upload must use the presentation file field.' } }); if (error?.message === 'Only PPT and PPTX files are allowed') return res.status(400).json({ error: { code: 'UNSUPPORTED_FILE_TYPE', message: 'Unsupported file type. Choose a PPT or PPTX file.' } }); if (status === 503) return res.status(503).json({ error: { code: 'UPLOAD_STORAGE_UNAVAILABLE', message: 'Upload storage is temporarily unavailable. Please try again.' } }); res.status(status).json(fail(status)); }); return app;
}
