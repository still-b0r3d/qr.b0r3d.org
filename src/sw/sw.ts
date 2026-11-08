// The service worker: keeps a copy of the site's files so b0r3d QR opens and works with no
// internet once it has been visited (and as an installed app). The build writes it to /sw.js with
// CACHE (named after the files' contents) and FILES (every file the page needs) put in front.
//
// - Pages come from the network first, so a new version shows as soon as there is one; with no
//   network the kept copy is used.
// - Everything else comes from the kept copy first. The caption fonts' Latin letters are kept up
//   front, their other letters once they're used.
// - A new version's worker waits until every tab of the old one is closed, so a page that's open
//   never loses files it still needs. It then deletes every other cache on this site, including
//   the ones the earlier site's worker kept. (When it replaces the earlier site's worker, it takes
//   over at once.)

declare const self: ServiceWorkerGlobalScope
declare const CACHE: string
declare const FILES: string[]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await (await caches.open(CACHE)).addAll(FILES)
      // The earlier site's worker keeps only its own files, so while it's in charge an offline
      // reload of this site would find none of them: this one takes over at once instead (the
      // earlier pages reload themselves when another worker takes over).
      if ((await caches.keys()).some((key) => key.startsWith('workbox-precache'))) await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const kept = await caches.open(CACHE)
        return (await kept.match(request, { ignoreSearch: true })) ?? (await kept.match('/')) ?? Response.error()
      })
    )
    return
  }
  event.respondWith(
    (async () => {
      const kept = await caches.open(CACHE)
      const hit = await kept.match(request)
      if (hit) return hit
      const response = await fetch(request)
      // a caption font's other letters, kept once they've been used
      if (response.ok && url.pathname.endsWith('.woff2')) await kept.put(request, response.clone())
      return response
    })()
  )
})

export {}
