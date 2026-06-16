// sw.js – Service Worker Daily Quests PWA v3
const CACHE = 'daily-quests-v3';
const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './quests.json',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

self.addEventListener('push', e => {
  e.waitUntil(self.registration.showNotification('Daily Quests ⚔️', {
    body: e.data ? e.data.text() : 'Deine täglichen Aufgaben warten auf dich!',
    icon: './icons/icon-192.png',
    badge: './icons/favicon-32.png',
    vibrate: [100, 50, 100]
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./'));
});
