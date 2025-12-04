/**
 * src/services/vehicle-service.ts
 *
 * Vehicle data access & business logic layer for SuiteWastePWA
 *
 * Responsibilities:
 *  - Enforce multi-tenant queries (always filtered by org_id)
 *  - CRUD operations
 *  - Compliance auto-evaluation helper
 *  - Pagination and list filtering
 *
 * All SQL uses prepared statements to prevent injection.
 */

import type { Env } from '../types';

export interface VehicleRecord {
  id: number;
  uuid: string;
  org_id: number;
  registration_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  license_expiry: number | null;
  roadworthy_expiry: number | null;
  cof_expiry: number | null;
  tracking_device_id: string | null;
  fuel_type: string | null;
  capacity_kg: number | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface CreateVehicleInput {
  orgNumericId: number;
  registration_number: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  license_expiry?: number | null;
  roadworthy_expiry?: number | null;
  cof_expiry?: number | null;
  tracking_device_id?: string | null;
  fuel_type?: string | null;
  capacity_kg?: number | null;
}

export interface UpdateVehicleInput {
  registration_number?: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  license_expiry?: number | null;
  roadworthy_expiry?: number | null;
  cof_expiry?: number | null;
  tracking_device_id?: string | null;
  fuel_type?: string | null;
  capacity_kg?: number | null;
}

/* ---------------------------
   COMPLIANCE EVALUATION
   --------------------------- */

/** Returns high-level compliance status based on expiry dates */
export function evaluateCompliance(v: {
  license_expiry: number | null;
  roadworthy_expiry: number | null;
  cof_expiry: number | null;
}) {
  const now = Date.now();

  const expired = (ts: number | null) => ts !== null && ts < now;
  const expiringSoon = (ts: number | null, days = 30) =>
    ts !== null && ts < now + days * 24 * 3600 * 1000;

  const issues: string[] = [];

  if (expired(v.license_expiry)) issues.push('license_expired');
  else if (expiringSoon(v.license_expiry)) issues.push('license_expiring');

  if (expired(v.roadworthy_expiry)) issues.push('roadworthy_expired');
  else if (expiringSoon(v.roadworthy_expiry)) issues.push('roadworthy_expiring');

  if (expired(v.cof_expiry)) issues.push('cof_expired');
  else if (expiringSoon(v.cof_expiry)) issues.push('cof_expiring');

  return {
    is_compliant: issues.length === 0,
    issues
  };
}

/* ---------------------------
   DATA ACCESS OPERATIONS
   --------------------------- */

export async function createVehicle(env: Env, input: CreateVehicleInput): Promise<VehicleRecord> {
  const now = Date.now();
  const uuid = crypto.randomUUID();

  const sql = `
    INSERT INTO vehicles (
      uuid, org_id, registration_number, make, model, year,
      license_expiry, roadworthy_expiry, cof_expiry,
      tracking_device_id, fuel_type, capacity_kg,
      is_active, created_at, updated_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13, ?14)
  `;

  await env.DB.prepare(sql).bind(
    uuid,
    input.orgNumericId,
    input.registration_number,
    input.make ?? null,
    input.model ?? null,
    input.year ?? null,
    input.license_expiry ?? null,
    input.roadworthy_expiry ?? null,
    input.cof_expiry ?? null,
    input.tracking_device_id ?? null,
    input.fuel_type ?? null,
    input.capacity_kg ?? null,
    now,
    now
  ).run();

  const res = await env.DB
    .prepare(`SELECT * FROM vehicles WHERE uuid = ?1 LIMIT 1`)
    .bind(uuid)
    .all();

  return res.results[0] as VehicleRecord;
}

export async function getVehicleByUuid(env: Env, orgNumericId: number, uuid: string) {
  const stmt = env.DB.prepare(
    `SELECT * FROM vehicles
     WHERE uuid = ?1 AND org_id = ?2 AND is_active = 1 LIMIT 1`
  ).bind(uuid, orgNumericId);

  const res = await stmt.all();
  return res.results.length > 0 ? (res.results[0] as VehicleRecord) : null;
}

export async function updateVehicle(
  env: Env,
  orgNumericId: number,
  uuid: string,
  input: UpdateVehicleInput
) {
  const now = Date.now();

  const fields = [];
  const values = [];

  for (const key of Object.keys(input)) {
    fields.push(`${key} = ?`);
    values.push((input as any)[key]);
  }

  if (fields.length === 0) return false;

  const sql = `
    UPDATE vehicles
    SET ${fields.join(', ')}, updated_at = ?
    WHERE uuid = ? AND org_id = ? AND is_active = 1
  `;

  values.push(now, uuid, orgNumericId);

  const stmt = env.DB.prepare(sql).bind(...values);
  await stmt.run();

  return true;
}

export async function softDeleteVehicle(env: Env, orgNumericId: number, uuid: string) {
  const sql = `
    UPDATE vehicles SET is_active = 0
    WHERE uuid = ?1 AND org_id = ?2 AND is_active = 1
  `;
  await env.DB.prepare(sql).bind(uuid, orgNumericId).run();
  return true;
}

export async function listVehicles(
  env: Env,
  orgNumericId: number,
  opts?: { page?: number; pageSize?: number }
) {
  const page = opts?.page ?? 1;
  const size = opts?.pageSize ?? 20;
  const offset = (page - 1) * size;

  const sql = `
    SELECT * FROM vehicles
    WHERE org_id = ?1 AND is_active = 1
    ORDER BY created_at DESC
    LIMIT ?2 OFFSET ?3
  `;

  const res = await env.DB.prepare(sql).bind(orgNumericId, size, offset).all();
  const rows = res.results as VehicleRecord[];

  const countRes = await env.DB
    .prepare(`SELECT COUNT(*) as total FROM vehicles WHERE org_id = ?1 AND is_active = 1`)
    .bind(orgNumericId)
    .all();

  const total = countRes.results[0].total as number;

  return {
    items: rows,
    pagination: {
      page,
      pageSize: size,
      total,
      totalPages: Math.ceil(total / size)
    }
  };
}
