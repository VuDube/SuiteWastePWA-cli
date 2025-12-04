/**
 * src/routes/auth.ts
 * Hono router for authentication: /register, /login, /logout, /refresh
 *
 * Behavior:
 * - POST /register { email, password, full_name, org_uuid }
 * - POST /login { email, password, org_uuid } => { access_token, refresh_token, user }
 * - POST /logout { refresh_token } (Authorization: Bearer <access_token> recommended)
 * - POST /refresh { refresh_token } => rotates refresh token and issues new access token
 *
 * Security:
 * - Enforces strong password policy via Zod
 * - Rate-limits failed login attempts via KV (5 attempts/IP/15 minutes)
 * - Stores refresh tokens in user_sessions table
 * - Access token TTL = 7 days (JWT)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { hashPassword, comparePassword, resolveOrgNumericId, createUser, getUserByEmailAndOrg, generateAccessToken, createSession, getSessionByToken, revokeSession, rotateSessionToken, getUserById } from '../services/auth-service';
import { sendError } from '../middleware';

const auth = new Hono<{ Bindings: Env }>();

/* ---------- Validation Schemas ---------- */
const registerSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(8, 'Password must be at least 8 characters').refine((val) => {
    // Enforce at least one uppercase, one lowercase, one number, one special
    const re = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&~^#()_\-+=<>.,;:'"`|\\\/\[\]{}])/;
    return re.test(val);
  }, { message: 'Password must include uppercase, lowercase, number and special character' }),
  full_name: z.string().min(2),
  org_uuid: z.string().uuid('Invalid organization UUID')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  org_uuid: z.string().uuid()
});

const refreshSchema = z.object({
  refresh_token: z.string().min(10)
});

const logoutSchema = z.object({
  refresh_token: z.string().min(10)
});

/* ---------- KV Rate-limiting keys / thresholds ---------- */
const LOGIN_ATTEMPT_PREFIX = 'login_attempts:'; // keyed by IP
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_TTL_SECONDS = 15 * 60; // 15 minutes

/* ---------- Helpers ---------- */
function nowMs() {
  return Date.now();
}

/* ---------- POST /register ---------- */
auth.post('/register', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = registerSchema.parse(body);

    const env = c.env;
    // Resolve numeric org id
    const orgNumericId = await resolveOrgNumericId(env, parsed.org_uuid);
    if (!orgNumericId) {
      return sendError(c, { message: 'Organization not found', code: 'ORG_NOT_FOUND', status: 404 });
    }

    // Check duplicate email within org
    const existing = await getUserByEmailAndOrg(env, parsed.email, orgNumericId);
    if (existing) {
      return sendError(c, { message: 'Email already registered', code: 'EMAIL_EXISTS', status: 409 });
    }

    // Hash password
    const passwordHash = await hashPassword(parsed.password);

    // Create user
    const created = await createUser(env, {
      orgNumericId,
      orgUuid: parsed.org_uuid,
      email: parsed.email,
      passwordHash,
      full_name: parsed.full_name,
      role: 'driver' // default role; admin must be created by owner later
    });

    const requestId = c.get('requestId') as string | undefined;

    const resp = {
      success: true,
      data: {
        user: {
          id: created.uuid,
          email: created.email,
          full_name: created.full_name,
          role: created.role
        }
      },
      timestamp: nowMs(),
      request_id: requestId ?? ''
    };

    return c.json(resp, 201);
  } catch (err: unknown) {
    const e = err as any;
    if (e?.issues) {
      // Zod validation error
      return sendError(c, { message: e.issues.map((i: any) => i.message).join('; '), code: 'VALIDATION_ERROR', status: 400 });
    }
    console.error('Register error', err);
    return sendError(c, { message: 'Registration failed', code: 'REGISTER_FAILED', status: 400 });
  }
});

/* ---------- POST /login ---------- */
auth.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = loginSchema.parse(body);

    const env = c.env;
    const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '0.0.0.0';
    const kv = env.KV_CACHE;
    const attemptKey = `${LOGIN_ATTEMPT_PREFIX}${clientIp}:${parsed.email}`;

    // Check lockout
    if (kv) {
      const attemptsRaw = await kv.get(attemptKey);
      const attempts = Number(attemptsRaw ?? '0');
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        return sendError(c, { message: 'Too many failed login attempts. Try again later.', code: 'LOGIN_LOCKED', status: 429 });
      }
    }

    // Resolve org numeric id
    const orgNumericId = await resolveOrgNumericId(env, parsed.org_uuid);
    if (!orgNumericId) {
      return sendError(c, { message: 'Organization not found', code: 'ORG_NOT_FOUND', status: 404 });
    }

    const userRow = await getUserByEmailAndOrg(env, parsed.email, orgNumericId);
    if (!userRow) {
      // Increment failed attempts
      if (kv) {
        const cur = Number((await kv.get(attemptKey)) ?? '0');
        await kv.put(attemptKey, String(cur + 1), { expirationTtl: LOCKOUT_TTL_SECONDS });
      }
      return sendError(c, { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS', status: 401 });
    }

    const passwordHash = userRow.password_hash as string;
    const match = await comparePassword(parsed.password, passwordHash);
    if (!match) {
      if (kv) {
        const cur = Number((await kv.get(attemptKey)) ?? '0');
        await kv.put(attemptKey, String(cur + 1), { expirationTtl: LOCKOUT_TTL_SECONDS });
      }
      return sendError(c, { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS', status: 401 });
    }

    // Successful login: reset KV counter
    if (kv) {
      await kv.delete(attemptKey);
    }

    // Generate JWT (access token)
    // Resolve organization uuid for payload (we have parsed.org_uuid)
    const payload = {
      sub: userRow.uuid,
      email: userRow.email,
      role: userRow.role,
      org_id: parsed.org_uuid
    };

    const accessToken = await generateAccessToken(env as Env, payload);
    // Create refresh session
    const session = await createSession(env as Env, {
      user_id: userRow.id,
      ip: clientIp,
      userAgent: c.req.header('user-agent') ?? null
    });

    // Update last_login_at
    await env.DB.prepare('UPDATE users SET last_login_at = ?1 WHERE id = ?2').bind(Date.now(), userRow.id).run();

    const requestId = c.get('requestId') as string | undefined;

    const resp = {
      success: true,
      data: {
        token: accessToken,
        refresh_token: session.token,
        user: {
          id: userRow.uuid,
          email: userRow.email,
          full_name: userRow.full_name,
          role: userRow.role
        }
      },
      timestamp: nowMs(),
      request_id: requestId ?? ''
    };

    return c.json(resp, 200);
  } catch (err: unknown) {
    const e = err as any;
    if (e?.issues) {
      return sendError(c, { message: e.issues.map((i: any) => i.message).join('; '), code: 'VALIDATION_ERROR', status: 400 });
    }
    console.error('Login error', err);
    return sendError(c, { message: 'Login failed', code: 'LOGIN_FAILED', status: 400 });
  }
});

/* ---------- POST /logout ---------- */
auth.post('/logout', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = logoutSchema.parse(body);

    const env = c.env;
    // Revoke refresh token
    const session = await getSessionByToken(env, parsed.refresh_token);
    if (!session) {
      // Already logged out; still return success for idempotency
      const requestId = c.get('requestId') as string | undefined;
      return c.json({ success: true, data: {}, timestamp: nowMs(), request_id: requestId ?? '' }, 200);
    }

    await revokeSession(env, parsed.refresh_token);

    const requestId = c.get('requestId') as string | undefined;
    return c.json({ success: true, data: {}, timestamp: nowMs(), request_id: requestId ?? '' }, 200);
  } catch (err: unknown) {
    const e = err as any;
    if (e?.issues) {
      return sendError(c, { message: e.issues.map((i: any) => i.message).join('; '), code: 'VALIDATION_ERROR', status: 400 });
    }
    console.error('Logout error', err);
    return sendError(c, { message: 'Logout failed', code: 'LOGOUT_FAILED', status: 400 });
  }
});

/* ---------- POST /refresh ---------- */
auth.post('/refresh', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = refreshSchema.parse(body);

    const env = c.env;

    const session = await getSessionByToken(env, parsed.refresh_token);
    if (!session) {
      return sendError(c, { message: 'Invalid refresh token', code: 'INVALID_REFRESH', status: 401 });
    }

    // Check expiry
    if (session.expires_at && Number(session.expires_at) < Date.now()) {
      // Revoke and deny
      await revokeSession(env, parsed.refresh_token);
      return sendError(c, { message: 'Refresh token expired', code: 'REFRESH_EXPIRED', status: 401 });
    }

    // Fetch user
    const user = await getUserById(env, session.user_id);
    if (!user) {
      return sendError(c, { message: 'User not found', code: 'USER_NOT_FOUND', status: 404 });
    }

    // Resolve org uuid from organizations table using user's org_id numeric
    const orgRowRes = await env.DB.prepare('SELECT uuid FROM organizations WHERE id = ?1 LIMIT 1').bind(user.org_id).all();
    const orgRow = (orgRowRes.results && orgRowRes.results.length > 0) ? orgRowRes.results[0] : null;
    const orgUuid = orgRow ? orgRow.uuid : null;

    if (!orgUuid) {
      return sendError(c, { message: 'Organization not found', code: 'ORG_NOT_FOUND', status: 404 });
    }

    // Rotate refresh token
    const rotated = await rotateSessionToken(env, session.id);
    if (!rotated) {
      return sendError(c, { message: 'Unable to rotate session', code: 'SESSION_ROTATE_FAILED', status: 500 });
    }

    // Generate new access token
    const payload = {
      sub: user.uuid,
      email: user.email,
      role: user.role,
      org_id: orgUuid
    };
    const accessToken = await generateAccessToken(env as Env, payload);

    const requestId = c.get('requestId') as string | undefined;

    const resp = {
      success: true,
      data: {
        token: accessToken,
        refresh_token: rotated.token
      },
      timestamp: nowMs(),
      request_id: requestId ?? ''
    };

    return c.json(resp, 200);
  } catch (err: unknown) {
    const e = err as any;
    if (e?.issues) {
      return sendError(c, { message: e.issues.map((i: any) => i.message).join('; '), code: 'VALIDATION_ERROR', status: 400 });
    }
    console.error('Refresh error', err);
    return sendError(c, { message: 'Refresh failed', code: 'REFRESH_FAILED', status: 400 });
  }
});

export default auth;
