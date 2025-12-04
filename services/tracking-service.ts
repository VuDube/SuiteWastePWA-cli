/**
 * src/services/tracking-service.ts
 *
 * Responsibilities:
 *  - Validate incoming GPS payloads
 *  - Store latest GPS position in KV (TTL 5 minutes)
 *  - Buffer GPS points in KV per-vehicle for batched writes to D1
 *  - Flush buffered points to D1 (called automatically on conditions or can be scheduled)
 *  - Geofence detection helper (basic)
 *  - Harsh acceleration detection helper (basic)
 *
 * Notes:
 *  - All DB writes use parameterized prepared statements to prevent SQL injection.
 *  - Uses c.env.KV_CACHE for caching and buffering.
 */

import type { Env } from './types';

export interface GpsPoint {
  vehicle_uuid: string; // vehicle uuid (app-level)
  vehicle_id?: number;  // numeric id (resolved by server)
  org_numeric_id?: number;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null; // m/s
  heading?: number | null;
  recorded_at: number;   // ms since epoch
}

/** Keys */
const LATEST_KV_KEY = (vehicleId: number) => `tracking:vehicle:${vehicleId}:latest`;
const BUFFER_KV_KEY = (vehicleId: number) => `tracking:vehicle:${vehicleId}:buffer`;
const BUFFER_LAST_FLUSH = (vehicleId: number) => `tracking:vehicle:${vehicleId}:last_flush`;

/** Configuration */
const LATEST_TTL_SECONDS = 5 * 60; // keep latest for 5 minutes
const BUFFER_FLUSH_MS = 5 * 60 * 1000; // flush buffer every 5 minutes
const BUFFER_MAX_POINTS = 200; // flush if buffer grows this big
const HARSH_ACCEL_THRESHOLD_M_S2 = 5.0; // example threshold (m/s^2) ~ ~0.5g (tunable)

/* ---------------------
   Validation helpers
   --------------------- */
export function validateLatLon(lat: number, lon: number): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/* ---------------------
   Resolve numeric vehicle id from uuid
   --------------------- */
export async function resolveVehicleNumericId(env: Env, orgNumericId: number, vehicleUuid: string): Promise<number | null> {
  const res = await env.DB.prepare('SELECT id FROM vehicles WHERE uuid = ?1 AND org_id = ?2 AND is_active = 1 LIMIT 1')
    .bind(vehicleUuid, orgNumericId)
    .all();
  if (!res.results || res.results.length === 0) return null;
  return res.results[0].id as number;
}

/* ---------------------
   Store latest in KV
   --------------------- */
export async function storeLatestInKV(env: Env, vehicleId: number, point: GpsPoint): Promise<void> {
  const kv = env.KV_CACHE;
  if (!kv) return;
  const key = LATEST_KV_KEY(vehicleId);
  await kv.put(key, JSON.stringify(point), { expirationTtl: LATEST_TTL_SECONDS });
}

/* ---------------------
   Buffer point in KV
   --------------------- */
export async function bufferPoint(env: Env, vehicleId: number, point: GpsPoint): Promise<number> {
  const kv = env.KV_CACHE;
  if (!kv) {
    // If KV not available, we will write directly to DB (fallback)
    await writeSinglePointToDb(env, vehicleId, point);
    return 1;
  }

  const key = BUFFER_KV_KEY(vehicleId);
  let bufferRaw = await kv.get(key);
  let buffer: GpsPoint[] = bufferRaw ? JSON.parse(bufferRaw) : [];

  buffer.push(point);

  // If buffer exceeds max length, flush synchronously
  if (buffer.length >= BUFFER_MAX_POINTS) {
    // Write to DB then reset buffer
    await flushBufferToDb(env, vehicleId, buffer);
    await kv.delete(key);
    await kv.put(BUFFER_LAST_FLUSH(vehicleId), String(Date.now()), { expirationTtl: 60 * 60 * 24 });
    return 0;
  } else {
    await kv.put(key, JSON.stringify(buffer), { expirationTtl: 60 * 60 * 24 }); // keep buffer up to 24h
    return buffer.length;
  }
}

/* ---------------------
   Flush buffer to D1 (batched insert)
   --------------------- */
export async function flushBufferToDb(env: Env, vehicleId: number, points?: GpsPoint[]): Promise<number> {
  // If points not provided, read from KV
  const kv = env.KV_CACHE;
  let localPoints = points;
  if (!localPoints) {
    if (!kv) return 0;
    const key = BUFFER_KV_KEY(vehicleId);
    const raw = await kv.get(key);
    localPoints = raw ? JSON.parse(raw) as GpsPoint[] : [];
    if (!localPoints || localPoints.length === 0) return 0;
  }

  // Prepare batched inserts - use transaction style multiple inserts
  // D1 doesn't support explicit transactions in this SDK, but multiple parameterized runs are OK.
  const stmt = env.DB.prepare(`
    INSERT INTO gps_tracking (vehicle_id, org_id, latitude, longitude, accuracy, speed, heading, recorded_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  `);

  let inserted = 0;
  for (const p of localPoints) {
    const orgNumericId = p.org_numeric_id ?? 0;
    await stmt.bind(vehicleId, orgNumericId, p.latitude, p.longitude, p.accuracy ?? null, p.speed ?? null, p.heading ?? null, p.recorded_at).run();
    inserted++;
  }

  // Clear KV buffer
  if (kv) {
    await kv.delete(BUFFER_KV_KEY(vehicleId));
    await kv.put(BUFFER_LAST_FLUSH(vehicleId), String(Date.now()), { expirationTtl: 60 * 60 * 24 });
  }

  return inserted;
}

/* ---------------------
   Fallback: write single point directly to D1
   --------------------- */
export async function writeSinglePointToDb(env: Env, vehicleId: number, point: GpsPoint): Promise<void> {
  const sql = `
    INSERT INTO gps_tracking (vehicle_id, org_id, latitude, longitude, accuracy, speed, heading, recorded_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  `;
  await env.DB.prepare(sql).bind(
    vehicleId,
    point.org_numeric_id ?? 0,
    point.latitude,
    point.longitude,
    point.accuracy ?? null,
    point.speed ?? null,
    point.heading ?? null,
    point.recorded_at
  ).run();
}

/* ---------------------
   Decide whether to flush based on last flush time
   --------------------- */
export async function maybeFlushBuffer(env: Env, vehicleId: number): Promise<void> {
  const kv = env.KV_CACHE;
  if (!kv) return;

  const lastFlushRaw = await kv.get(BUFFER_LAST_FLUSH(vehicleId));
  const lastFlush = lastFlushRaw ? Number(lastFlushRaw) : 0;
  const now = Date.now();

  if (now - lastFlush >= BUFFER_FLUSH_MS) {
    // read buffer and flush
    const key = BUFFER_KV_KEY(vehicleId);
    const raw = await kv.get(key);
    const buffer = raw ? (JSON.parse(raw) as GpsPoint[]) : [];
    if (buffer.length > 0) {
      await flushBufferToDb(env, vehicleId, buffer);
    } else {
      // nothing to flush, just update last_flush to avoid repeated checks
      await kv.put(BUFFER_LAST_FLUSH(vehicleId), String(now), { expirationTtl: 60 * 60 * 24 });
    }
  }
}

/* ---------------------
   Geofence helper (simple distance check)
   --------------------- */
export function haversineDistanceKm(lat1:number, lon1:number, lat2:number, lon2:number): number {
  const toRad = (x:number) => x * Math.PI / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function isWithinMeters(lat1:number, lon1:number, lat2:number, lon2:number, meters:number): boolean {
  const km = haversineDistanceKm(lat1, lon1, lat2, lon2);
  return (km * 1000) <= meters;
}

/* ---------------------
   Harsh acceleration detection
   - Accepts prior speed and current speed and time delta (s)
   - returns acceleration m/s^2
--------------------- */
export function computeAcceleration(prevSpeed:number, curSpeed:number, deltaSeconds:number): number {
  if (deltaSeconds <= 0) return 0;
  return (curSpeed - prevSpeed) / deltaSeconds;
}

export function isHarshAcceleration(accelMps2:number): boolean {
  return Math.abs(accelMps2) >= HARSH_ACCEL_THRESHOLD_M_S2;
}
