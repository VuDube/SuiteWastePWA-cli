/**
 * SuiteWaste OS - Advanced Service Worker
 * - Versioned cache for atomic updates
 * - Pre-caches app shell and offline fallback page
 * - Stale-While-Revalidate for static assets (CSS, JS, images)
 * - Network-First for navigation and API requests, with offline fallback
 * - Immediate activation with skipWaiting and clients.claim
 */

const APP_CACHE_v1 = 'suitewaste-os-cache-v1';
const OFFLINE_URL = '/offline.html';

// Pre-cache the app shell and critical static assets
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  OFFLINE_URL,
  // Add paths to your core CSS, JS, and image files here
  // Example: '/assets/app.css', '/assets/logo.svg'
];

/**
 * Install Event:
 * - Opens the cache and pre-caches the app shell.
 * - Calls self.skipWaiting() to activate the new SW immediately.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE_v1);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

/**
 * Activate Event:
 * - Cleans up old caches to free up storage.
 * - Takes immediate control of all open clients.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== APP_CACHE_v1)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

/**
 * Fetch Event:
 * - Implements hybrid caching strategies based on request type.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Always handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Strategy 1: Stale-While-Revalidate for static assets
  if (/\.(css|js|png|jpg|jpeg|svg|gif)$/.test(request.url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // Strategy 2: Network-First for navigation and API calls
  else {
    event.respondWith(networkFirst(request));
  }
});

/**
 * Stale-While-Revalidate Strategy:
 * - Responds from cache immediately if available (stale).
 * - Simultaneously, fetches a fresh version from the network and updates the cache.
 * - Ideal for non-critical assets where having the latest version is not essential.
 */
const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(APP_CACHE_v1);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then((networkResponse) => {
    cache.put(request, networkResponse.clone());
    return networkResponse;
  });

  return cachedResponse || fetchPromise;
};

/**
 * Network-First Strategy:
 * - Tries to fetch from the network first.
 * - If successful, caches the response and returns it.
 * - If the network fails, falls back to the cache.
 * - If not in cache, falls back to the offline page for navigation requests.
 */
const networkFirst = async (request) => {
  try {
    // Try to fetch from the network
    const networkResponse = await fetch(request);
    
    // Cache the successful response
    const cache = await caches.open(APP_CACHE_v1);
    cache.put(request, networkResponse.clone());
    
    return networkResponse;
  } catch (error) {
    // Network failed, try the cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // For navigation requests, show the offline fallback page
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match(OFFLINE_URL);
      return offlinePage;
    }

    // For other failed requests, return a generic error
    return new Response('Network error', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
};

/**
 * Message Listener:
 * - Listens for a 'SKIP_WAITING' message from the page to force SW activation.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
