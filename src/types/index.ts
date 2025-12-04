/**
 * src/types/index.ts
 * Shared TypeScript types for SuiteWastePWA Worker
 *
 * Notes:
 *  - Keep this file minimal and import into other modules for strict typing.
 *  - Env/CloudflareBindings includes D1, KV, R2, and necessary env strings.
 */

export type Maybe<T> = T | null | undefined;

export interface APIResponseSuccess<T = unknown> {
  success: true;
  data: T;
  timestamp: number;
  request_id: string;
}

export interface APIResponseError {
  success: false;
  error: string;
  code?: string;
  http_status: number;
  timestamp: number;
  request_id: string;
}

export type Role = 'admin' | 'dispatcher' | 'driver' | 'manager';

export interface JwtPayload {
  sub: string; // user uuid
  email: string;
  role: Role;
  org_id: string; // organization uuid (not numeric id)
  iat?: number;
  exp?: number;
}

export interface AuthContext {
  jwt?: JwtPayload;
  userId?: string;
  orgId?: string;
  requestId?: string;
}

export interface CloudflareBindings {
  DB: D1Database; // Cloudflare D1 binding
  KV_CACHE: KVNamespace;
  R2_PODS: R2Bucket; // R2 bucket for Proof of Delivery - name as bound in wrangler.toml
  // Optional AI binding if configured
  AI?: unknown;
  // Environment variables (in case you want to read them from c.env)
  JWT_SECRET?: string;
  NEXTBILLION_API_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}

export interface Env extends CloudflareBindings {}
