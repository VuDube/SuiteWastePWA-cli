/**
 * src/middleware.ts
 * Hono middleware: JWT verification, CORS, logging, rate-limiting, request id utilities.
 *
 * Usage:
 *  import { jwtMiddleware, corsMiddleware, rateLimitMiddleware, loggerMiddleware } from './middleware';
 *  app.use('*', loggerMiddleware);
 *  app.use('*', corsMiddleware);
 *  app.use('/api/*', rateLimitMiddleware({ max:100, windowSeconds:60 }));
 *  app.use('/api/protected/*', jwtMiddleware());
 *
 * Security goals:
 *  - JWT validated using HS256 via @tsndr/cloudflare-worker-jwt
 *  - Rate limiting stored in KV_CACHE with per-IP keys
 *  - All responses use the standard API envelope
 */

import { Context, Next } from 'hono';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { Env, JwtPayload } from './types';

// Helper: generate request id (UUID v4)
export function genRequestId(): string {
  // crypto.randomUUID is available in Cloudflare Workers runtime
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function nowMs(): number {
  return Date.now();
}

// Logger middleware: structured JSON logs with request_id
export const loggerMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const requestId = genRequestId();
  c.set('requestId', requestId);

  const start = Date.now();
  try {
    await next();
  } finally {
    const duration = Date.now() - start;
    const level = c.res && c.res.status && c.res.status >= 500 ? 'ERROR' : 'INFO';
    const log = {
      timestamp: new Date().toISOString(),
      level,
      request_id: requestId,
      method: c.req.method,
      path: c.req.url,
      status: c.res?.status || 0,
      duration_ms: duration,
      ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
      user_agent: c.req.header('user-agent') || ''
    };
    // Using console.log so Cloudflare logs capture structured JSON
    console.log(JSON.stringify(log));
  }
};

// CORS middleware
export const corsMiddleware = (options?: { allowedOrigins?: string[] }) => {
  const allowedOrigins = options?.allowedOrigins ?? ['https://localhost:3000'];

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const origin = c.req.header('Origin') || c.req.header('origin') || '';
    const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    c.res.headers.set('Access-Control-Allow-Origin', allowOrigin);
    c.res.headers.set('Access-Control-Allow-Credentials', 'true');
    c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

    if (c.req.method === 'OPTIONS') {
      return c.text('', 204);
    }

    await next();
  };
};

// Error helper: standard error response
export const sendError = (c: Context<{ Bindings: Env }>, params: {
  message: string;
  code?: string;
  status?: number;
}) => {
  const requestId = (c.get('requestId') as string) ?? genRequestId();
  const status = params.status ?? 400;
  const body = {
    success: false,
    error: params.message,
    code: params.code ?? 'ERROR',
    http_status: status,
    timestamp: nowMs(),
    request_id: requestId
  };
  return c.json(body, status);
};

// Extract IP helper
export const getClientIp = (c: Context<{ Bindings: Env }>) => {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '0.0.0.0';
};

// JWT middleware factory
export const jwtMiddleware = (opts?: { required?: boolean }) => {
  const required = opts?.required ?? true;

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const requestId = (c.get('requestId') as string) ?? genRequestId();
    c.set('requestId', requestId);

    const auth = c.req.header('Authorization') || '';
    if (!auth || !auth.startsWith('Bearer ')) {
      if (required) {
        return sendError(c, { message: 'Unauthorized: missing Authorization header', code: 'UNAUTHORIZED', status: 401 });
      } else {
        // proceed without auth
        return next();
      }
    }
    const token = auth.substring(7);

    try {
      const secret = c.env.JWT_SECRET || (process.env && (process.env as any).JWT_SECRET);
      if (!secret) {
        console.error('JWT secret not configured');
        return sendError(c, { message: 'Server configuration error', code: 'SERVER_CONFIG', status: 500 });
      }

      const isValid = await jwt.verify(token, secret);
      if (!isValid) {
        return sendError(c, { message: 'Invalid token', code: 'INVALID_TOKEN', status: 401 });
      }

      // Decode payload (verify returns boolean; to get payload use decode)
      const decoded = await jwt.decode(token) as unknown;
      // ensure typed payload shape
      const payload = (decoded as JwtPayload) ?? undefined;
      if (!payload || !payload.org_id || !payload.sub) {
        return sendError(c, { message: 'Invalid token payload', code: 'INVALID_TOKEN_PAYLOAD', status: 401 });
      }

      // inject into context
      c.set('auth', payload);
      c.set('userId', payload.sub);
      c.set('orgId', payload.org_id);
      c.set('requestId', requestId);

      await next();
    } catch (err: unknown) {
      console.error('JWT verify error', err);
      return sendError(c, { message: 'Unauthorized', code: 'UNAUTHORIZED', status: 401 });
    }
  };
};

// Rate limiting middleware using KV (fixed window)
export const rateLimitMiddleware = (opts?: { requests?: number; windowSeconds?: number }) => {
  const maxRequests = opts?.requests ?? 100; // default 100 requests/window
  const windowSeconds = opts?.windowSeconds ?? 60; // default 60s

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const kv = c.env.KV_CACHE;
    if (!kv) {
      // KV not configured - allow by default (but log)
      console.warn('KV_CACHE not configured - skipping rate limiting');
      await next();
      return;
    }

    const ip = getClientIp(c);
    const route = new URL(c.req.url).pathname;
    const key = `rate:${ip}:${route}`;
    const now = Math.floor(Date.now() / 1000);
    const windowKey = `${key}:${Math.floor(now / windowSeconds)}`;

    try {
      const current = Number(await kv.get(windowKey)) || 0;
      if (current >= maxRequests) {
        // Rate limited
        c.res.headers.set('Retry-After', String(windowSeconds));
        return sendError(c, { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED', status: 429 });
      }

      // Increment (use atomic operations if available; Cloudflare KV doesn't support incr natively)
      // Workaround: store numeric string and use put with expiration
      await kv.put(windowKey, String(current + 1), { expirationTtl: windowSeconds });
    } catch (err) {
      // On KV errors, log and continue (fail open)
      console.error('Rate limit KV error', err);
    }

    await next();
  };
};
