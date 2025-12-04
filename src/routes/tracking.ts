/**
 * src/routes/tracking.ts
 *
 * Routes:
 *  - POST /tracking         -> ingest a GPS update (body contains vehicle_uuid, lat, lon, speed, heading, recorded_at)
 *  - GET  /tracking/vehicles -> list last-known positions for org (from KV)
 *  - GET  /tracking/vehicle/:uuid/history?minutes=60 -> read last N minutes from gps_tracking table
 *
 * Behavior:
 *  - Validates payload
 *  - Resolves vehicle numeric id via vehicles.uuid (multi-tenant)
 *  - Stores latest in KV and buffers point for batch flush
 *  - Calls Durable Object to broadcast update to subscribers
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import {
  validateLatLon,
  resolveVehicleNumericId,
  storeLatestInKV,
  bufferPoint,
  maybeFlushBuffer,
  computeAcceleration,
  isHarshAcceleration
} from '../services/tracking-service';
import { jwtMiddleware, sendError } from '../middleware';

const router = new Hono<{ Bindings: Env }>();

/* ---------- Validation ---------- */
const gpsSchema = z.object({
  vehicle_uuid: z.string().uuid(),
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().optional().nullable(),
  speed: z.number().optional().nullable(), // m/s
  heading: z.number().optional().nullable(),
  recorded_at: z.number().optional() // ms since epoch
});

/* All routes require auth */
router.use('*', jwtMiddleware({ required: true }));

/* ---------- POST /tracking ---------- */
router.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = gpsSchema.parse(body);
    const orgUuid = c.get('orgId');
    if (!orgUuid) return sendError(c, { message: 'Missing org in token', code: 'BAD_ORG', status: 400 });

    // Resolve numeric org id
    const orgRow = await c.env.DB.prepare('SELECT id FROM organizations WHERE uuid = ?1 LIMIT 1').bind(orgUuid).all();
    if (!orgRow.results.length) return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });
    const orgNumericId = orgRow.results[0].id as number;

    // Validate lat/lon
    if (!validateLatLon(parsed.latitude, parsed.longitude)) {
      return sendError(c, { message: 'Invalid latitude/longitude', code: 'INVALID_COORDS', status: 400 });
    }

    // Resolve vehicle numeric id
    const vehicleNumericId = await resolveVehicleNumericId(c.env, orgNumericId, parsed.vehicle_uuid);
    if (!vehicleNumericId) {
      return sendError(c, { message: 'Vehicle not found', code: 'VEHICLE_NOT_FOUND', status: 404 });
    }

    const recordedAt = parsed.recorded_at ?? Date.now();

    const point = {
      vehicle_uuid: parsed.vehicle_uuid,
      vehicle_id: vehicleNumericId,
      org_numeric_id: orgNumericId,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      accuracy: parsed.accuracy ?? null,
      speed: parsed.speed ?? null,
      heading: parsed.heading ?? null,
      recorded_at: recordedAt
    };

    // Store latest snapshot in KV
    await storeLatestInKV(c.env, vehicleNumericId, point);

    // Buffer point for batch writes
    const bufferLen = await bufferPoint(c.env, vehicleNumericId, point);

    // Maybe flush if it's been long
    await maybeFlushBuffer(c.env, vehicleNumericId);

    // Detect harsh acceleration if possible: get last speed from KV.latest
    try {
      const kv = c.env.KV_CACHE;
      if (kv) {
        const lastRaw = await kv.get(`tracking:vehicle:${vehicleNumericId}:last_speed`);
        const last = lastRaw ? Number(lastRaw) : null;
        if (last !== null && parsed.speed !== undefined && parsed.speed !== null) {
          // compute delta - recorded_at could be same; guard
          const lastTsRaw = await kv.get(`tracking:vehicle:${vehicleNumericId}:last_ts`);
          const lastTs = lastTsRaw ? Number(lastTsRaw) : null;
          const deltaSeconds = lastTs ? Math.max((recordedAt - lastTs) / 1000, 0.001) : 1;
          const accel = computeAcceleration(last, parsed.speed ?? 0, deltaSeconds);
          if (isHarshAcceleration(accel)) {
            // log compliance event into compliance_logs table
            await c.env.DB.prepare(
              `INSERT INTO compliance_logs (uuid, org_id, compliance_item, entity_type, entity_id, status, logged_at, created_at)
               VALUES (?1, ?2, ?3, 'vehicle', ?4, 'warning', ?5, ?6)`
            ).bind(crypto.randomUUID(), orgNumericId, 'harsh_acceleration', vehicleNumericId, Date.now(), Date.now()).run();
          }
        }
        // update last_speed and last_ts
        if (parsed.speed !== undefined && parsed.speed !== null) {
          await kv.put(`tracking:vehicle:${vehicleNumericId}:last_speed`, String(parsed.speed), { expirationTtl: 60 * 60 * 24 });
          await kv.put(`tracking:vehicle:${vehicleNumericId}:last_ts`, String(recordedAt), { expirationTtl: 60 * 60 * 24 });
        }
      }
    } catch (e) {
      console.error('Harsh detection error', e);
    }

    // Broadcast update to Durable Object (real-time)
    try {
      const DO_NAMESPACE = c.env.VEHICLE_TRACKING_DO; // Durable Object binding
      if (DO_NAMESPACE) {
        // call DO fetch to send update (DO will broadcast to subscribers)
        const doUrl = `https://do/${parsed.vehicle_uuid}/update`; // stub path; DO fetch uses stub.fetch with path
        // We call DO_NAMESPACE.get(id) then fetch on stub
        const id = DO_NAMESPACE.idFromName(parsed.vehicle_uuid);
        const stub = DO_NAMESPACE.get(id);
        await stub.fetch(`/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(point)
        });
      }
    } catch (e) {
      console.error('DO broadcast error', e);
    }

    const requestId = c.get('requestId') as string | undefined;
    return c.json({
      success: true,
      data: { buffered: bufferLen },
      timestamp: Date.now(),
      request_id: requestId ?? ''
    });
  } catch (err: any) {
    if (err?.issues) {
      return sendError(c, { message: err.issues.map((i:any) => i.message).join('; '), code: 'VALIDATION_ERROR', status: 400 });
    }
    console.error('Tracking ingest error', err);
    return sendError(c, { message: 'Failed to ingest tracking', code: 'TRACKING_FAILED', status: 500 });
  }
});

/* ---------- GET /tracking/vehicles ---------- */
router.get('/vehicles', async (c) => {
  try {
    const orgUuid = c.get('orgId');
    if (!orgUuid) return sendError(c, { message: 'Missing org', code: 'BAD_ORG', status: 400 });

    // Resolve numeric org id
    const row = await c.env.DB.prepare('SELECT id FROM organizations WHERE uuid = ?1 LIMIT 1').bind(orgUuid).all();
    if (!row.results.length) return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });
    const orgNumericId = row.results[0].id as number;

    // Query vehicles in org
    const vRes = await c.env.DB.prepare('SELECT uuid, registration_number, id FROM vehicles WHERE org_id = ?1 AND is_active = 1').bind(orgNumericId).all();
    const vehicles = vRes.results as any[] || [];

    const kv = c.env.KV_CACHE;
    const out = [];
    for (const v of vehicles) {
      let latest = null;
      if (kv) {
        const raw = await kv.get(`tracking:vehicle:${v.id}:latest`);
        latest = raw ? JSON.parse(raw) : null;
      }
      out.push({
        vehicle_uuid: v.uuid,
        registration_number: v.registration_number,
        last_seen: latest ? latest.recorded_at : null,
        position: latest ? { latitude: latest.latitude, longitude: latest.longitude, speed: latest.speed } : null
      });
    }

    return c.json({
      success: true,
      data: { vehicles: out },
      timestamp: Date.now(),
      request_id: c.get('requestId')
    });
  } catch (err) {
    console.error('Get vehicles positions error', err);
    return sendError(c, { message: 'Failed to list positions', code: 'LIST_POSITIONS_FAILED', status: 500 });
  }
});

/* ---------- GET /tracking/vehicle/:uuid/history?minutes=60 ---------- */
router.get('/vehicle/:uuid/history', async (c) => {
  try {
    const vehicleUuid = c.req.param('uuid');
    const minutes = Number(c.req.query('minutes') ?? 60);
    if (isNaN(minutes) || minutes <= 0 || minutes > 60*24*7) {
      return sendError(c, { message: 'Invalid minutes parameter', code: 'INVALID_PARAM', status: 400 });
    }

    const orgUuid = c.get('orgId');
    if (!orgUuid) return sendError(c, { message: 'Missing org', code: 'BAD_ORG', status: 400 });

    // resolve numeric ids
    const orgRow = await c.env.DB.prepare('SELECT id FROM organizations WHERE uuid = ?1 LIMIT 1').bind(orgUuid).all();
    if (!orgRow.results.length) return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });
    const orgNumericId = orgRow.results[0].id as number;

    const vehicleId = await resolveVehicleNumericId(c.env, orgNumericId, vehicleUuid);
    if (!vehicleId) return sendError(c, { message: 'Vehicle not found', code: 'VEHICLE_NOT_FOUND', status: 404 });

    const since = Date.now() - minutes * 60 * 1000;

    const sql = `SELECT latitude, longitude, speed, accuracy, heading, recorded_at FROM gps_tracking WHERE vehicle_id = ?1 AND org_id = ?2 AND recorded_at >= ?3 ORDER BY recorded_at DESC LIMIT 1000`;
    const res = await c.env.DB.prepare(sql).bind(vehicleId, orgNumericId, since).all();
    const rows = res.results || [];

    return c.json({
      success: true,
      data: { points: rows },
      timestamp: Date.now(),
      request_id: c.get('requestId')
    });
  } catch (err) {
    console.error('Get history error', err);
    return sendError(c, { message: 'Failed to fetch history', code: 'HISTORY_FAILED', status: 500 });
  }
});

export default router;
