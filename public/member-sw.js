// Made Kulture MEMBER service worker (2026-10-03) — web push for customers and
// directory members: new messages, listing requests. Registered at scope "/"
// by components/MemberApp.tsx. The admin keeps its own worker (sw.js, scope
// /admin); the more specific scope wins, so the two never collide.
// Deliberately NO fetch handler: nothing is cached, so a deploy is never hidden
// behind a stale copy (see the admin PWA stale-build lesson).

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'Made Kulture', {
    body: data.body || '',
    icon: '/icons/mk-192.png',
    badge: '/icons/mk-192.png',
    data: { url: data.url || '/account/messages' },
    tag: data.tag || undefined,
    renotify: !!data.tag,
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/account/messages'
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of clients) {
      if (!c.url.includes('/admin') && 'focus' in c) { c.navigate(url); return c.focus() }
    }
    return self.clients.openWindow(url)
  })())
})
