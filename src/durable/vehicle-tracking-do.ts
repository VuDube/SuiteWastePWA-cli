/**
 * src/durable/vehicle-tracking-do.ts
 *
 * Durable Object: VehicleTrackingDO
 *
 * Responsibilities:
 *  - Manage real-time subscriptions per vehicle_uuid via WebSocket
 *  - Allow route to POST updates to DO which will be broadcast to subscribers
 *  - Maintain small in-memory map of clients per vehicle for broadcast
 *
 * Usage:
 *  - Clients open WebSocket to the DO instance with path /subscribe?vehicle_uuid={uuid}
 *  - Routes call stub.fetch('/update') with POST JSON body to broadcast to subscribers
 *
 * Note:
 *  - Durable Object keeps state per instance (per-stub id). We'll instantiate DO per vehicle using idFromName(vehicle_uuid)
 *  - This file exports the class; reference it in wrangler.toml as a durable object binding named VEHICLE_TRACKING_DO
 */

export interface Client {
  id: string;
  socket: WebSocket;
}

export default class VehicleTrackingDO {
  state: DurableObjectState;
  env: any;
  // Map of clientId -> WebSocket
  clients: Map<string, WebSocket>;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.clients = new Map();
  }

  // Helper to broadcast JSON to all connected sockets
  async broadcast(payload: any) {
    const data = JSON.stringify(payload);
    for (const [id, socket] of this.clients.entries()) {
      try {
        socket.send(data);
      } catch (e) {
        console.warn('Failed to send to socket', id, e);
        try { socket.close(); } catch (_) {}
        this.clients.delete(id);
      }
    }
  }

  // Accept WebSocket upgrades for /subscribe
  async handleSubscribe(request: Request) {
    const url = new URL(request.url);
    const vehicleUuid = url.searchParams.get('vehicle_uuid');
    if (!vehicleUuid) {
      return new Response('Missing vehicle_uuid', { status: 400 });
    }

    // Accept websocket
    const { 0: client, 1: server } = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    server.accept();

    const clientId = crypto.randomUUID();
    this.clients.set(clientId, server);

    server.addEventListener('message', (evt) => {
      // For now, just log incoming messages (e.g., client pings)
      try {
        // keepalive or subscription messages if needed
      } catch (e) {
        console.error('DO server message error', e);
      }
    });

    server.addEventListener('close', (evt) => {
      this.clients.delete(clientId);
    });

    server.addEventListener('error', (evt) => {
      this.clients.delete(clientId);
    });

    // Optionally send a welcome message
    server.send(JSON.stringify({ type: 'subscribed', vehicle_uuid: vehicleUuid, timestamp: Date.now() }));

    return new Response(null, { status: 101, webSocket: client });
  }

  // Handle update broadcasts posted to DO
  async handleUpdate(request: Request) {
    try {
      const body = await request.json();
      // Basic validation
      if (!body || !body.vehicle_uuid) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid payload' }), { status: 400 });
      }

      // Broadcast to connected clients
      await this.broadcast({ type: 'update', payload: body, timestamp: Date.now() });

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
      console.error('DO update error', e);
      return new Response(JSON.stringify({ success: false, error: 'Server error' }), { status: 500 });
    }
  }

  // Durable Object fetch entrypoint
  async fetch(request: Request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Route dispatching
    if (pathname === '/subscribe' && request.headers.get('Upgrade') === 'websocket') {
      return this.handleSubscribe(request);
    }

    if (pathname === '/update' && request.method === 'POST') {
      return this.handleUpdate(request);
    }

    return new Response('Not found', { status: 404 });
  }
}
