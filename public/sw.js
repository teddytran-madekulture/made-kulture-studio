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
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/admin') && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
