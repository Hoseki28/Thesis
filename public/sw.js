// TEG Monitoring Service Worker
const CACHE_NAME = 'teg-monitoring-pwa-v4.25'
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192.svg',
  '/icon-512.svg'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      // Only delete older cache versions; keep the current CACHE_NAME intact
      return Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  // Network-first with persistent cache fallback for HTML, JS, CSS, and assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const copy = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        }
        return networkResponse
      })
      .catch(async () => {
        const cached = await caches.match(event.request)
        if (cached) return cached
        if (event.request.mode === 'navigate' || event.request.destination === 'document') {
          return caches.match('/index.html') || caches.match('/')
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' })
      })
  )
})
