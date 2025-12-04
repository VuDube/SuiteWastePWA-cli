/**
 * src/index.ts
 * Hono application entrypoint for SuiteWastePWA
 *
 * Exports default app for Cloudflare Workers (wrangler publish).
 *
 * - Attaches middleware (logger, cors, rate limit)
 * - Mounts routes (auth, vehicles, collections, tracking) — these route modules will be provided in later bundles.
 * - Provides /health endpoint and standardized error handling with request_id.
 *
 * IMPORTANT:
 *  - Ensure route modules exist at the specified imports (they will be delivered in subsequent bundles).
 */

import { Hono } from 'hono';
import { corsMiddleware, loggerMiddleware, rateLimitMiddleware, jwtMiddleware, sendError } from './middleware';
import type { Env } from './types';

// Route imports (routes will be added in later bundles)
import authRoutes from './routes/auth';
import vehiclesRoutes from './routes/vehicles';
import collectionsRoutes from './routes/collections';
import trackingRoutes from './routes/tracking';

// Create Hono app with typed Bindings
const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', loggerMiddleware);
app.use('*', corsMiddleware({ allowedOrigins: (process.env.ALLOWED_ORIGINS ? (process.env.ALLOWED_ORIGINS.split(',')) : ['https://localhost:3000']) }));

// Simple rate limit for all API routes (tunable)
app.use('/api/*', rateLimitMiddleware({ requests: 200, windowSeconds: 60 }));

// Health endpoint (public)
app.get('/health', async (c) => {
  const requestId = c.get('requestId') as string | undefined;
  const payload = {
    uptime_ms: Date.now(),
    status: 'ok',
    request_id: requestId ?? '',
    timestamp: Date.now()
  };
  return c.json({ success: true, data: payload, timestamp: Date.now(), request_id: requestId ?? '' }, 200);
});

// Mount route groups - each route file exports a Hono instance
// They should apply their own JWT middleware where required
app.route('/api/auth', authRoutes);
app.route('/api/vehicles', vehiclesRoutes);
app.route('/api/collections', collectionsRoutes);
app.route('/api/tracking', trackingRoutes);

// Generic 404
app.notFound((c) => {
  return sendError(c, { message: 'Not Found', code: 'NOT_FOUND', status: 404 });
});

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled worker error:', err, { request_id: c.get('requestId') });
  // Do not leak stack traces to clients in production
  const requestId = c.get('requestId') as string | undefined;
  return c.json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    http_status: 500,
    timestamp: Date.now(),
    request_id: requestId ?? ''
  }, 500);
});

export default app;
