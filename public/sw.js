/*
 * HSA Daily Patient Log — service worker.
 *
 * Scope of what this is for: making the app *open* on a bad or absent
 * connection. It is not what saves a daily entry offline — that is the outbox
 * in src/lib/client/outbox.ts, which does not depend on a service worker at
 * all, so an entry survives even on a browser that refuses to register one.
 *
 * Strategies, and why each:
 *
 *   /_next/static/*   cache-first. Content-hashed filenames, so a cached copy
 *                     can never be stale — this is the whole speed win on a
 *                     second visit.
 *   navigations       network-first with a cached fallback. The form must show
 *                     the live session state when there *is* a network; when
 *                     there is not, last night's copy of the page is far better
 *                     than the browser's dinosaur.
 *   /api/*            never cached. A stale /api/auth/me would tell a
 *                     practitioner they had already logged today when they had
 *                     not, and that is the one lie this app must not tell.
 *   RSC payloads      never cached (`?_rsc=` / `RSC: 1`). They pair with a
 *                     specific build; serving an old one breaks navigation in
 *                     a way that looks like a random crash.
 *
 * OWNER: Stream 2.
 */

const VERSION = 'hsa-v1'
const STATIC_CACHE = `${VERSION}-static`
const PAGE_CACHE = `${VERSION}-pages`

const PRECACHE = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // A failed precache must not leave the app with no worker at all.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function isRscRequest(request) {
  return (
    request.headers.get('RSC') === '1' ||
    new URL(request.url).searchParams.has('_rsc')
  )
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response && response.ok) cache.put(request, response.clone())
  return response
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE)
  try {
    const response = await fetch(request)
    if (response && response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    const hit = await cache.match(request)
    if (hit) return hit
    const offline = await caches.match('/offline.html')
    if (offline) return offline
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (isRscRequest(request)) return

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request))
    return
  }

  if (PRECACHE.includes(url.pathname) || url.pathname.startsWith('/_next/image')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
  }
})
