/**
 * src/routes/collections.ts
 *
 * Waste collection API routes:
 *
 *  - GET /api/collections
 *  - GET /api/collections/:uuid
 *  - POST /api/collections
 *  - PUT /api/collections/:uuid
 *  - DELETE /api/collections/:uuid
 *  - POST /api/collections/:uuid/pod-url  → Generate R2 signed upload URL
 *  - POST /api/collections/:uuid/complete → Mark completed (w/ POD & weight)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import {
  createCollection,
  getCollectionByUuid,
  updateCollection,
  listCollections,
  softDeleteCollection,
  generatePodObjectPath,
  generatePodUploadUrl
} from '../services/collections-service';

import { jwtMiddleware, sendError } from '../middleware';

const app = new Hono<{ Bindings: Env }>();

/* -----------------------------------------------------
   Validators
----------------------------------------------------- */
const createSchema = z.object({
  vehicle_id: z.number().optional().nullable(),
  driver_id: z.number().optional().nullable(),
  scheduled_date: z.number(),
  waste_category: z.string().min(1)
});

const updateSchema = createSchema.partial();

const completeSchema = z.object({
  waste_weight_kg: z.number().min(0),
  pod_image_url: z.string().min(1)
});

/* -----------------------------------------------------
   All routes require JWT
----------------------------------------------------- */
app.use('*', jwtMiddleware({ required: true }));

/* Resolve org numeric ID */
async function getOrgNumericId(c: any): Promise<number | null> {
  const orgUuid = c.get('orgId');
  if (!orgUuid) return null;

  const row = await c.env.DB
    .prepare(`SELECT id FROM organizations WHERE uuid = ?1 LIMIT 1`)
    .bind(orgUuid)
    .all();

  return row.results.length ? (row.results[0].id as number) : null;
}

/* -----------------------------------------------------
   GET / (list)
----------------------------------------------------- */
app.get('/', async (c) => {
  try {
    const orgNumericId = await getOrgNumericId(c);
    if (!orgNumericId)
      return sendError(c, { message: 'Organization not found', code: 'ORG_NOT_FOUND', status: 404 });

    const url = new URL(c.req.url);

    const date = url.searchParams.get('date');
    let dateStart: number | undefined;
    let dateEnd: number | undefined;

    if (date) {
      const d = new Date(date);
      dateStart = d.setHours(0, 0, 0, 0);
      dateEnd = d.setHours(23, 59, 59, 999);
    }

    const result = await listCollections(c.env, orgNumericId, {
      dateStart,
      dateEnd,
      status: url.searchParams.get('status') ?? undefined,
      waste_category: url.searchParams.get('waste_category') ?? undefined,
      page: Number(url.searchParams.get('page') ?? '1'),
      pageSize: Number(url.searchParams.get('pageSize') ?? '20')
    });

    return c.json({
      success: true,
      data: result,
      timestamp: Date.now(),
      request_id: c.get('requestId')
    });
  } catch (err) {
    console.error('List collections error', err);
    return sendError(c, { message: 'Failed to list', code: 'LIST_FAILED', status: 500 });
  }
});

/* -----------------------------------------------------
   GET /:uuid
----------------------------------------------------- */
app.get('/:uuid', async (c) => {
  const uuid = c.req.param('uuid');

  try {
    const orgNumericId = await getOrgNumericId(c);
    if (!orgNumericId)
      return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });

    const col = await getCollectionByUuid(c.env, orgNumericId, uuid);
    if (!col)
      return sendError(c, { message: 'Not found', code: 'NOT_FOUND', status: 404 });

    return c.json({
      success: true,
      data: { collection: col },
      timestamp: Date.now(),
      request_id: c.get('requestId')
    });
  } catch (err) {
    console.error('Get collection error', err);
    return sendError(c, { message: 'Failed to fetch', code: 'FETCH_FAILED', status: 500 });
  }
});

/* -----------------------------------------------------
   POST /
----------------------------------------------------- */
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createSchema.parse(body);

    const orgNumericId = await getOrgNumericId(c);
    if (!orgNumericId)
      return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });

    const created = await createCollection(c.env, {
      orgNumericId,
      ...parsed
    });

    return c.json({
      success: true,
      data: { collection: created },
      timestamp: Date.now(),
      request_id: c.get('requestId')
    }, 201);
  } catch (err: any) {
    if (err?.issues)
      return sendError(c, { message: 'Validation error', code: 'VALIDATION', status: 400 });
    console.error('Create collection error', err);
    return sendError(c, { message: 'Failed to create', code: 'CREATE_FAILED', status: 500 });
  }
});

/* -----------------------------------------------------
   PUT /:uuid
----------------------------------------------------- */
app.put('/:uuid', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = updateSchema.parse(body);

    const orgNumericId = await getOrgNumericId(c);
    if (!orgNumericId)
      return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });

    const uuid = c.req.param('uuid');
    const existing = await getCollectionByUuid(c.env, orgNumericId, uuid);

    if (!existing)
      return sendError(c, { message: 'Not found', code: 'NOT_FOUND', status: 404 });

    await updateCollection(c.env, orgNumericId, uuid, parsed);

    const updated = await getCollectionByUuid(c.env, orgNumericId, uuid);

    return c.json({
      success: true,
      data: { collection: updated },
      timestamp: Date.now(),
      request_id: c.get('requestId')
    });
  } catch (err: any) {
    if (err?.issues)
      return sendError(c, { message: 'Validation error', code: 'VALIDATION', status: 400 });
    console.error('Update collection error', err);
    return sendError(c, { message: 'Failed to update', code: 'UPDATE_FAILED', status: 500 });
  }
});

/* -----------------------------------------------------
   DELETE /:uuid
----------------------------------------------------- */
app.delete('/:uuid', async (c) => {
  try {
    const orgNumericId = await getOrgNumericId(c);
    if (!orgNumericId)
      return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });

    const uuid = c.req.param('uuid');
    const existing = await getCollectionByUuid(c.env, orgNumericId, uuid);

    if (!existing)
      return sendError(c, { message: 'Not found', code: 'NOT_FOUND', status: 404 });

    await softDeleteCollection(c.env, orgNumericId, uuid);

    return c.json({
      success: true,
      data: {},
      timestamp: Date.now(),
      request_id: c.get('requestId')
    });
  } catch (err) {
    console.error('Delete collection error', err);
    return sendError(c, { message: 'Failed to delete', code: 'DELETE_FAILED', status: 500 });
  }
});

/* -----------------------------------------------------
   POST /:uuid/pod-url  → Generate Signed URL for POD Upload
----------------------------------------------------- */
app.post('/:uuid/pod-url', async (c) => {
  try {
    const orgNumericId = await getOrgNumericId(c);
    if (!orgNumericId)
      return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });

    const uuid = c.req.param('uuid');
    const col = await getCollectionByUuid(c.env, orgNumericId, uuid);

    if (!col)
      return sendError(c, { message: 'Collection not found', code: 'NOT_FOUND', status: 404 });

    const objectPath = generatePodObjectPath(uuid);
    const signedUrl = await generatePodUploadUrl(c.env, objectPath);

    return c.json({
      success: true,
      data: {
        upload_url: signedUrl,
        object_path: objectPath
      },
      timestamp: Date.now(),
      request_id: c.get('requestId')
    });
  } catch (err) {
    console.error('POD URL gen error', err);
    return sendError(c, { message: 'Failed to generate upload URL', code: 'POD_URL_FAILED', status: 500 });
  }
});

/* -----------------------------------------------------
   POST /:uuid/complete  → Mark Completed
----------------------------------------------------- */
app.post('/:uuid/complete', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = completeSchema.parse(body);

    const orgNumericId = await getOrgNumericId(c);
    if (!orgNumericId)
      return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });

    const uuid = c.req.param('uuid');
    const col = await getCollectionByUuid(c.env, orgNumericId, uuid);

    if (!col)
      return sendError(c, { message: 'Not found', code: 'NOT_FOUND', status: 404 });

    // Update "completed" status
    await updateCollection(c.env, orgNumericId, uuid, {
      status: 'completed',
      waste_weight_kg: parsed.waste_weight_kg,
      pod_image_url: parsed.pod_image_url
    });

    const updated = await getCollectionByUuid(c.env, orgNumericId, uuid);

    return c.json({
      success: true,
      data: { collection: updated },
      timestamp: Date.now(),
      request_id: c.get('requestId')
    });
  } catch (err: any) {
    if (err?.issues)
      return sendError(c, { message: 'Validation error', code: 'VALIDATION', status: 400 });
    console.error('Complete collection error', err);
    return sendError(c, { message: 'Failed to complete', code: 'COMPLETE_FAILED', status: 500 });
  }
});

export default app;
