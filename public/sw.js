// Padayon Power Monitor Service Worker
const CACHE_NAME = 'padayon-pwa-v4.0'
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
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      // Clear all old caches
      return Promise.all(keys.map((key) => caches.delete(key)))
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  // Always fetch fresh from network for all HTML and JS scripts
  if (event.request.mode === 'navigate' || event.request.destination === 'document' || event.request.destination === 'script') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    )
    return
  }

  // Network-first for everything else
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        }
        return networkResponse
      })
      .catch(() => caches.match(event.request))
  )
})
