/**
 * src/services/collections-service.ts
 *
 * Waste collection job, stops, and POD service layer.
 * Implements:
 *  - Create collection jobs
 *  - List collections w/ filters
 *  - Get collection details
 *  - Update job status
 *  - Generate R2 signed upload URLs for POD photos
 *  - Multi-tenant enforcement
 *
 * NO direct JSON responses here — only pure logic.
 */

import type { Env } from '../types';

export interface CollectionRecord {
  id: number;
  uuid: string;
  org_id: number;
  vehicle_id: number | null;
  driver_id: number | null;
  scheduled_date: number;
  waste_category: string;
  status: string;
  waste_weight_kg: number | null;
  pod_image_url: string | null;
  created_at: number;
  updated_at: number;
  is_active: number;
}

export interface CreateCollectionInput {
  orgNumericId: number;
  vehicle_id?: number | null;
  driver_id?: number | null;
  scheduled_date: number;
  waste_category: string;
}

export interface UpdateCollectionInput {
  vehicle_id?: number | null;
  driver_id?: number | null;
  scheduled_date?: number;
  waste_category?: string;
  status?: string;
  waste_weight_kg?: number | null;
  pod_image_url?: string | null;
}

/* -----------------------------------------------------
   Helpers
----------------------------------------------------- */
export function generatePodObjectPath(collectionUuid: string): string {
  return `pods/${collectionUuid}/${Date.now()}.jpg`;
}

/**
 * R2 Signed URL generator
 */
export async function generatePodUploadUrl(env: Env, objectPath: string): Promise<string> {
  const bucket = env.R2_PODS;
  if (!bucket) throw new Error('R2 bucket not configured');

  const url = await bucket.createPresignedUrl({
    method: 'PUT',
    key: objectPath,
    expiration: 60 * 10, // 10 minutes
    headers: {
      'Content-Type': 'image/jpeg'
    }
  });

  return url;
}

/* -----------------------------------------------------
   Create Collection
----------------------------------------------------- */
export async function createCollection(
  env: Env,
  input: CreateCollectionInput
): Promise<CollectionRecord> {
  const uuid = crypto.randomUUID();
  const now = Date.now();

  const sql = `
    INSERT INTO waste_collections (
      uuid, org_id, vehicle_id, driver_id,
      scheduled_date, waste_category, status,
      created_at, updated_at, is_active
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'scheduled', ?7, ?8, 1)
  `;

  await env.DB.prepare(sql)
    .bind(
      uuid,
      input.orgNumericId,
      input.vehicle_id ?? null,
      input.driver_id ?? null,
      input.scheduled_date,
      input.waste_category,
      now,
      now
    )
    .run();

  const row = await env.DB
    .prepare(`SELECT * FROM waste_collections WHERE uuid = ?1 LIMIT 1`)
    .bind(uuid)
    .all();

  return row.results[0] as CollectionRecord;
}

/* -----------------------------------------------------
   Get by UUID
----------------------------------------------------- */
export async function getCollectionByUuid(
  env: Env,
  orgNumericId: number,
  uuid: string
): Promise<CollectionRecord | null> {
  const res = await env.DB.prepare(
    `SELECT * FROM waste_collections
     WHERE uuid = ?1 AND org_id = ?2 AND is_active = 1
     LIMIT 1`
  )
    .bind(uuid, orgNumericId)
    .all();

  return res.results.length ? (res.results[0] as CollectionRecord) : null;
}

/* -----------------------------------------------------
   Update Collection
----------------------------------------------------- */
export async function updateCollection(
  env: Env,
  orgNumericId: number,
  uuid: string,
  input: UpdateCollectionInput
) {
  const now = Date.now();
  const fields = [];
  const values = [];

  for (const k of Object.keys(input)) {
    fields.push(`${k} = ?`);
    values.push((input as any)[k]);
  }

  if (fields.length === 0) return false;

  values.push(now, uuid, orgNumericId);

  const sql = `
    UPDATE waste_collections
    SET ${fields.join(', ')}, updated_at = ?
    WHERE uuid = ? AND org_id = ? AND is_active = 1
  `;

  await env.DB.prepare(sql).bind(...values).run();
  return true;
}

/* -----------------------------------------------------
   Soft Delete
----------------------------------------------------- */
export async function softDeleteCollection(
  env: Env,
  orgNumericId: number,
  uuid: string
) {
  await env.DB.prepare(
    `UPDATE waste_collections SET is_active = 0
     WHERE uuid = ?1 AND org_id = ?2 AND is_active = 1`
  )
    .bind(uuid, orgNumericId)
    .run();

  return true;
}

/* -----------------------------------------------------
   List Collections
----------------------------------------------------- */
export async function listCollections(
  env: Env,
  orgNumericId: number,
  opts: {
    dateStart?: number;
    dateEnd?: number;
    status?: string;
    waste_category?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const page = opts.page ?? 1;
  const size = opts.pageSize ?? 20;
  const offset = (page - 1) * size;

  const params: any[] = [orgNumericId];
  const conditions = [`org_id = ?1`, `is_active = 1`];

  if (opts.dateStart !== undefined) {
    conditions.push(`scheduled_date >= ?${params.length + 1}`);
    params.push(opts.dateStart);
  }

  if (opts.dateEnd !== undefined) {
    conditions.push(`scheduled_date <= ?${params.length + 1}`);
    params.push(opts.dateEnd);
  }

  if (opts.status) {
    conditions.push(`status = ?${params.length + 1}`);
    params.push(opts.status);
  }

  if (opts.waste_category) {
    conditions.push(`waste_category = ?${params.length + 1}`);
    params.push(opts.waste_category);
  }

  const sql = `
    SELECT *
    FROM waste_collections
    WHERE ${conditions.join(' AND ')}
    ORDER BY scheduled_date DESC
    LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}
  `;

  params.push(size, offset);

  const res = await env.DB.prepare(sql).bind(...params).all();
  const rows = res.results as CollectionRecord[];

  const countSql = `
    SELECT COUNT(*) as total
    FROM waste_collections
    WHERE ${conditions.join(' AND ')}
  `;

  const countRes = await env.DB.prepare(countSql).bind(...params.slice(0, -2)).all();
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
