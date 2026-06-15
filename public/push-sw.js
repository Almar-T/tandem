// Custom push handlers, imported into the Workbox-generated service worker.
// Shows incoming notifications and focuses/opens the app when one is clicked.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Tandem', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Tandem'
  const options = {
    body: data.body || '',
    icon: '/tandem/icons/pwa-192.png',
    badge: '/tandem/icons/pwa-192.png',
    data: { url: data.url || '/tandem/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/tandem/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/tandem') && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
