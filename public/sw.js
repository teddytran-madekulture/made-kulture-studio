// Made Kulture admin service worker — Web Push + notification clicks.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch {}
  const title = data.title || 'Made Kulture'
  const isKiosk = (data.tag || '') === 'kiosk-summon'
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
    // A guest is standing at a tablet — let Teddy commit from the lock screen
    // without opening the app. ⚠️ iOS does not render notification actions, so
    // this is a shortcut, never the only way: the in-admin banner (KioskAck) is
    // the surface that has to work everywhere.
    actions: isKiosk ? [{ action: 'omw', title: "I'm on my way" }] : undefined,
  }
  const work = [self.registration.showNotification(title, options)]

  // ⚠️ THIS IS WHY THE DESKTOP ALERT IS INSTANT.
  //
  // Chrome applies "intensive throttling" to a tab hidden for more than 5
  // minutes: its timers drop from our 20s interval to ONCE PER MINUTE. That is
  // exactly the situation the audible alert exists for — Teddy in another app
  // with the admin behind it — so a setInterval can never be the primary path.
  // A service worker is not a timer; it is woken by the push itself, so this
  // fires immediately no matter how long the tab has been buried.
  //
  // (Chrome exempts pages that have made noise in the last 30s, but the docs
  // explicitly say a SILENT audio track does not count — so the usual
  // keep-the-tab-awake hack is closed off. This is the supported route.)
  if (isKiosk) {
    work.push((async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) {
        if (client.url.includes('/admin')) {
          client.postMessage({
            type: 'kiosk-ring',
            place: (data.meta && data.meta.place) || '',
          })
        }
      }
    })())
  }

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
    // ⚠️ ONLY the explicit "I'm on my way" action acknowledges a ring.
    //
    // This used to ack on ANY tap of the notification, which meant looking at it
    // to see what it said told the guest's tablet that help was coming and
    // stopped the escalating re-pushes. Tapping to READ is not a promise; the
    // guest is told someone is coming only when Teddy says someone is coming.
    if (isKiosk && event.action === 'omw') {
      try { await fetch('/api/admin/kiosk-ack', { method: 'POST' }) } catch (e) {}
      return   // stay on the lock screen — he's walking over, not reading the app
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
