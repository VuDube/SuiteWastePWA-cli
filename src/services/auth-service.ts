/**
 * src/services/auth-service.ts
 * Authentication helper service for SuiteWastePWA
 *
 * Responsibilities:
 * - Password hashing & verification
 * - JWT generation & decoding
 * - Session management (create/revoke/lookup) using D1 user_sessions table
 * - Resolve numeric org_id from organizations.uuid
 *
 * Important:
 * - All SQL uses parameterized prepared statements to prevent SQL injection.
 * - Timestamps are milliseconds since epoch.
 */

import type { Env } from '../types';
import * as bcrypt from 'bcryptjs';
import jwt from '@tsndr/cloudflare-worker-jwt';

export interface CreatedUser {
  id: number;
  uuid: string;
  email: string;
  full_name: string;
  role: string;
  org_uuid: string;
}

export interface SessionRecord {
  id: number;
  user_id: number;
  token: string; // refresh token
  expires_at: number;
  created_at: number;
  ip_address?: string;
  user_agent?: string;
  is_active: number;
}

const BCRYPT_SALT_ROUNDS = 10;
const ACCESS_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Hash a password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

// Compare a plaintext password to a hash
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Resolve organization numeric id from organization UUID
export async function resolveOrgNumericId(env: Env, orgUuid: string): Promise<number | null> {
  const sql = 'SELECT id FROM organizations WHERE uuid = ?1 AND is_active = 1 LIMIT 1';
  const stmt = env.DB.prepare(sql).bind(orgUuid);
  const res = await stmt.all();
  const row = (res.results && res.results.length > 0) ? res.results[0] : null;
  if (!row) return null;
  return row.id as number;
}

// Create a user (returns created user metadata)
export async function createUser(env: Env, params: {
  orgNumericId: number;
  orgUuid: string;
  email: string;
  passwordHash: string;
  full_name: string;
  role?: 'admin' | 'dispatcher' | 'driver' | 'manager';
}) : Promise<CreatedUser> {
  const now = Date.now();
  const userUuid = crypto.randomUUID();

  const sql = `
    INSERT INTO users (
      uuid, org_id, email, password_hash, full_name, role, is_active, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8)
  `;
  const stmt = env.DB.prepare(sql).bind(
    userUuid,
    params.orgNumericId,
    params.email.toLowerCase(),
    params.passwordHash,
    params.full_name,
    params.role ?? 'driver',
    now,
    now
  );

  const insertRes = await stmt.run();
  // insertRes.meta?.last_row_id may exist; fallback to querying by uuid
  const newId = (insertRes && (insertRes as any).meta && (insertRes as any).meta.last_row_id) ? (insertRes as any).meta.last_row_id : null;

  return {
    id: newId ?? -1,
    uuid: userUuid,
    email: params.email.toLowerCase(),
    full_name: params.full_name,
    role: params.role ?? 'driver',
    org_uuid: params.orgUuid
  };
}

// Get user record by email + org numeric id
export async function getUserByEmailAndOrg(env: Env, email: string, orgNumericId: number) {
  const sql = `SELECT * FROM users WHERE org_id = ?1 AND LOWER(email) = ?2 AND is_active = 1 LIMIT 1`;
  const stmt = env.DB.prepare(sql).bind(orgNumericId, email.toLowerCase());
  const res = await stmt.all();
  const row = (res.results && res.results.length > 0) ? res.results[0] : null;
  return row ?? null;
}

// Generate access (JWT) token
export async function generateAccessToken(env: Env, payload: Record<string, any>, expiresInSeconds = ACCESS_TOKEN_TTL_SECONDS): Promise<string> {
  const secret = env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  // Add iat/exp
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };
  const token = await jwt.sign(fullPayload, secret);
  return token;
}

// Create refresh session token and persist into user_sessions
export async function createSession(env: Env, options: {
  user_id: number;
  expiresAtMs?: number;
  ip?: string | null;
  userAgent?: string | null;
}) : Promise<SessionRecord> {
  const refreshToken = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = options.expiresAtMs ?? (now + REFRESH_TOKEN_TTL_MS);

  const sql = `
    INSERT INTO user_sessions (user_id, token, expires_at, created_at, ip_address, user_agent, is_active)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)
  `;
  const stmt = env.DB.prepare(sql).bind(
    options.user_id,
    refreshToken,
    expiresAt,
    now,
    options.ip ?? null,
    options.userAgent ?? null
  );

  const res = await stmt.run();
  const insertedId = (res && (res as any).meta && (res as any).meta.last_row_id) ? (res as any).meta.last_row_id : -1;

  return {
    id: insertedId,
    user_id: options.user_id,
    token: refreshToken,
    expires_at: expiresAt,
    created_at: now,
    ip_address: options.ip ?? undefined,
    user_agent: options.userAgent ?? undefined,
    is_active: 1
  } as SessionRecord;
}

// Find session by refresh token
export async function getSessionByToken(env: Env, token: string): Promise<SessionRecord | null> {
  const sql = `SELECT * FROM user_sessions WHERE token = ?1 AND is_active = 1 LIMIT 1`;
  const stmt = env.DB.prepare(sql).bind(token);
  const res = await stmt.all();
  const row = (res.results && res.results.length > 0) ? res.results[0] : null;
  return row ?? null;
}

// Revoke a refresh session (soft delete)
export async function revokeSession(env: Env, token: string): Promise<boolean> {
  const sql = `UPDATE user_sessions SET is_active = 0 WHERE token = ?1`;
  const stmt = env.DB.prepare(sql).bind(token);
  const res = await stmt.run();
  return true;
}

// Update/rotate refresh token for a session id
export async function rotateSessionToken(env: Env, sessionId: number): Promise<SessionRecord | null> {
  const newToken = crypto.randomUUID();
  const now = Date.now();
  const newExpires = now + REFRESH_TOKEN_TTL_MS;
  const sql = `UPDATE user_sessions SET token = ?1, expires_at = ?2, created_at = ?3 WHERE id = ?4 RETURNING *`;
  // D1 may not support RETURNING universally; perform update then select
  const updateStmt = env.DB.prepare(`UPDATE user_sessions SET token = ?1, expires_at = ?2, created_at = ?3 WHERE id = ?4`)
    .bind(newToken, newExpires, now, sessionId);
  await updateStmt.run();

  const sel = env.DB.prepare(`SELECT * FROM user_sessions WHERE id = ?1 LIMIT 1`).bind(sessionId);
  const res = await sel.all();
  const row = (res.results && res.results.length > 0) ? res.results[0] : null;
  return row ?? null;
}

// Helper: fetch users by id
export async function getUserById(env: Env, userId: number) {
  const stmt = env.DB.prepare('SELECT * FROM users WHERE id = ?1 LIMIT 1').bind(userId);
  const res = await stmt.all();
  const row = (res.results && res.results.length > 0) ? res.results[0] : null;
  return row ?? null;
}
