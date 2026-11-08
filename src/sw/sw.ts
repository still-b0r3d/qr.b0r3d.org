// The service worker: keeps a copy of the site's files so b0r3d QR opens and works with no
// internet once it has been visited (and as an installed app). The build writes it to /sw.js with
// CACHE (named after the files' contents) and FILES (every file the page needs) put in front.
//
// - Pages come from the network first, so a new version shows as soon as there is one; with no
//   network the kept copy is used.
// - Everything else comes from the kept copy first.
// - A new version's worker waits until every tab of the old one is closed, so a page that's open
//   never loses files it still needs. It then deletes every other cache on this site, including
//   the ones the earlier site's worker kept.

declare const self: ServiceWorkerGlobalScope
declare const CACHE: string
declare const FILES: string[]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)))
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
      return (await kept.match(request)) ?? fetch(request)
    })()
  )
})

export {}
