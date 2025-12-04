/**
 * src/routes/vehicles.ts
 *
 * Vehicle CRUD routes for SuiteWastePWA.
 * Mounted under: /api/vehicles
 *
 * All routes require JWT authentication.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import {
  createVehicle,
  getVehicleByUuid,
  updateVehicle,
  listVehicles,
  softDeleteVehicle,
  evaluateCompliance
} from '../services/vehicle-service';
import { jwtMiddleware, sendError } from '../middleware';

const vehicles = new Hono<{ Bindings: Env }>();

/* -------------------- Validators -------------------- */

const createVehicleSchema = z.object({
  registration_number: z.string().min(1),
  make: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  year: z.number().optional().nullable(),
  license_expiry: z.number().optional().nullable(),
  roadworthy_expiry: z.number().optional().nullable(),
  cof_expiry: z.number().optional().nullable(),
  tracking_device_id: z.string().optional().nullable(),
  fuel_type: z.string().optional().nullable(),
  capacity_kg: z.number().optional().nullable()
});

const updateVehicleSchema = createVehicleSchema.partial();

/* -------------------- Apply JWT --------------------- */
vehicles.use('*', jwtMiddleware({ required: true }));

/* -------------------- GET / ------------------------- */

vehicles.get('/', async (c) => {
  try {
    const orgUuid = c.get('orgId');
    if (!orgUuid) {
      return sendError(c, { message: 'Missing org in token', code: 'BAD_ORG', status: 400 });
    }

    // Resolve numeric org_id from organizations.uuid
    const orgRowRes = await c.env.DB
      .prepare(`SELECT id FROM organizations WHERE uuid = ?1 LIMIT 1`)
      .bind(orgUuid)
      .all();

    if (!orgRowRes.results.length) {
      return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });
    }
    const orgNumericId = orgRowRes.results[0].id as number;

    const url = new URL(c.req.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const size = Number(url.searchParams.get('pageSize') ?? '20');

    const result = await listVehicles(c.env, orgNumericId, { page, pageSize: size });

    const items = result.items.map((v) => ({
      ...v,
      compliance: evaluateCompliance(v)
    }));

    const requestId = c.get('requestId') as string;

    return c.json({
      success: true,
      data: {
        vehicles: items,
        pagination: result.pagination
      },
      timestamp: Date.now(),
      request_id: requestId
    });
  } catch (err: any) {
    console.error('List vehicles error', err);
    return sendError(c, { message: 'Failed to list vehicles', code: 'LIST_VEHICLES_FAILED', status: 500 });
  }
});

/* -------------------- GET /:uuid -------------------- */

vehicles.get('/:uuid', async (c) => {
  const uuid = c.req.param('uuid');

  try {
    const orgUuid = c.get('orgId');
    if (!orgUuid) {
      return sendError(c, { message: 'Missing org in token', code: 'BAD_ORG', status: 400 });
    }

    const row = await c.env.DB
      .prepare(`SELECT id FROM organizations WHERE uuid = ?1 LIMIT 1`)
      .bind(orgUuid)
      .all();

    if (!row.results.length) {
      return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });
    }
    const orgNumericId = row.results[0].id as number;

    const vehicle = await getVehicleByUuid(c.env, orgNumericId, uuid);
    if (!vehicle) {
      return sendError(c, { message: 'Vehicle not found', code: 'NOT_FOUND', status: 404 });
    }

    const requestId = c.get('requestId') as string;
    return c.json({
      success: true,
      data: { vehicle: { ...vehicle, compliance: evaluateCompliance(vehicle) } },
      timestamp: Date.now(),
      request_id: requestId
    });
  } catch (err: any) {
    console.error('Get vehicle error', err);
    return sendError(c, { message: 'Failed to fetch vehicle', code: 'FETCH_VEHICLE_FAILED', status: 500 });
  }
});

/* -------------------- POST / ------------------------ */

vehicles.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createVehicleSchema.parse(body);

    const orgUuid = c.get('orgId');
    const orgRowRes = await c.env.DB
      .prepare(`SELECT id FROM organizations WHERE uuid = ?1 LIMIT 1`)
      .bind(orgUuid)
      .all();

    if (!orgRowRes.results.length) {
      return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });
    }

    const orgNumericId = orgRowRes.results[0].id as number;

    const newVehicle = await createVehicle(c.env, {
      orgNumericId,
      ...parsed
    });

    const requestId = c.get('requestId') as string;

    return c.json({
      success: true,
      data: {
        vehicle: {
          ...newVehicle,
          compliance: evaluateCompliance(newVehicle)
        }
      },
      timestamp: Date.now(),
      request_id: requestId
    }, 201);
  } catch (err: any) {
    if (err?.issues) {
      return sendError(c, { message: err.issues.map((i: any) => i.message).join('; '), code: 'VALIDATION_ERROR', status: 400 });
    }
    console.error('Create vehicle error', err);
    return sendError(c, { message: 'Failed to create vehicle', code: 'CREATE_VEHICLE_FAILED', status: 500 });
  }
});

/* -------------------- PUT /:uuid -------------------- */

vehicles.put('/:uuid', async (c) => {
  const uuid = c.req.param('uuid');

  try {
    const body = await c.req.json();
    const parsed = updateVehicleSchema.parse(body);

    const orgUuid = c.get('orgId');
    const orgRowRes = await c.env.DB
      .prepare(`SELECT id FROM organizations WHERE uuid = ?1 LIMIT 1`)
      .bind(orgUuid)
      .all();

    if (!orgRowRes.results.length) {
      return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });
    }
    const orgNumericId = orgRowRes.results[0].id as number;

    const existing = await getVehicleByUuid(c.env, orgNumericId, uuid);
    if (!existing) {
      return sendError(c, { message: 'Vehicle not found', code: 'NOT_FOUND', status: 404 });
    }

    await updateVehicle(c.env, orgNumericId, uuid, parsed);

    // Fetch updated record
    const updated = await getVehicleByUuid(c.env, orgNumericId, uuid);

    const requestId = c.get('requestId') as string;

    return c.json({
      success: true,
      data: {
        vehicle: {
          ...updated!,
          compliance: evaluateCompliance(updated!)
        }
      },
      timestamp: Date.now(),
      request_id: requestId
    });
  } catch (err: any) {
    if (err?.issues) {
      return sendError(c, { message: err.issues.map((i: any) => i.message).join('; '), code: 'VALIDATION_ERROR', status: 400 });
    }
    console.error('Update vehicle error', err);
    return sendError(c, { message: 'Failed to update vehicle', code: 'UPDATE_VEHICLE_FAILED', status: 500 });
  }
});

/* -------------------- DELETE /:uuid ----------------- */

vehicles.delete('/:uuid', async (c) => {
  const uuid = c.req.param('uuid');

  try {
    const orgUuid = c.get('orgId');
    const orgRowRes = await c.env.DB
      .prepare(`SELECT id FROM organizations WHERE uuid = ?1 LIMIT 1`)
      .bind(orgUuid)
      .all();

    if (!orgRowRes.results.length) {
      return sendError(c, { message: 'Org not found', code: 'ORG_NOT_FOUND', status: 404 });
    }
    const orgNumericId = orgRowRes.results[0].id as number;

    const existing = await getVehicleByUuid(c.env, orgNumericId, uuid);
    if (!existing) {
      return sendError(c, { message: 'Vehicle not found', code: 'NOT_FOUND', status: 404 });
    }

    await softDeleteVehicle(c.env, orgNumericId, uuid);

    const requestId = c.get('requestId') as string;
    return c.json({
      success: true,
      data: {},
      timestamp: Date.now(),
      request_id: requestId
    });
  } catch (err: any) {
    console.error('Delete vehicle error', err);
    return sendError(c, { message: 'Failed to delete vehicle', code: 'DELETE_VEHICLE_FAILED', status: 500 });
  }
});

export default vehicles;
