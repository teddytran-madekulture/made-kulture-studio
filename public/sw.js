// Made Kulture admin service worker — Web Push + notification clicks.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch {}
  const title = data.title || 'Made Kulture'
  const options = {
    body: data.body || '',
    icon: '/icons/admin-192.png',
    badge: '/icons/admin-192.png',
    data: { url: data.url || '/admin/inbox' },
    tag: data.tag || undefined,
    // renotify (with a tag) makes a repeat push re-alert instead of silently
    // replacing; requireInteraction keeps it on screen until acted on (desktop/Android).
    renotify: !!data.renotify,
    requireInteraction: !!data.requireInteraction,
  }
  const work = [self.registration.showNotification(title, options)]
  // App-icon badge count (iOS 16.4+ installed PWAs, Android, desktop).
  if (typeof data.badge === 'number' && 'setAppBadge' in self.navigator) {
    work.push(data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge())
  }
  event.waitUntil(Promise.all(work))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/admin/inbox'
  const isKiosk = event.notification.tag === 'kiosk-summon'
  event.waitUntil((async () => {
    // Acknowledge a kiosk ring right here in the SW — reliable on tap, unlike the
    // page-side ping which depends on the PWA fully loading (flaky on iOS). This
    // stops the escalating repeat pushes the moment Teddy taps the notification.
    if (isKiosk) {
      try { await fetch('/api/admin/kiosk-ack', { method: 'POST' }) } catch (e) {}
    }
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      if (client.url.includes('/admin') && 'focus' in client) {
        client.navigate(url)
        return client.focus()
      }
    }
    return self.clients.openWindow(url)
  })())
})
