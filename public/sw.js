const CACHE = 'ks-pwa-v1'
const APP_SHELL = ['/admin/', '/admin/manifest.webmanifest', '/admin/icons/icon-192.png', '/admin/icons/icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.addAll(APP_SHELL)
    const html = await (await fetch('/admin/')).text()
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
      .map(match => new URL(match[1], self.location.origin).href)
      .filter(url => new URL(url).origin === self.location.origin)
    await cache.addAll(assets)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]))
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/admin/') || url.pathname.startsWith('/admin/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/admin/')))
    return
  }
  event.respondWith(fetch(request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()))
    return response
  }).catch(() => caches.match(request)))
})
