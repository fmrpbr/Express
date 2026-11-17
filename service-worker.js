const CACHE_NAME = 'express-v2-de83235fe2b8';
const APP_SHELL = ["./index.html","./www/index.html","./www/phone-customers.js","./www/order-by-phone.js","./www/notice-policy.js","./www/notification-policy.js","./www/payments.js","./www/tariffs.js","./www/admin-dashboard.js","./www/manifest.webmanifest","./www/icons/icon-192.png","./www/icons/icon-512.png","./www/vendor/firebase.bundle.js","./www/vendor/native-push.bundle.js"];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('express-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if(request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Configuração e APIs nunca recebem HTML de fallback nem entram no cache.
  if(!APP_SHELL.some(path => new URL(path, self.location.href).pathname === url.pathname) && request.mode !== 'navigate') return;
  event.respondWith(fetch(request).then(response => {
    if(response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy))); }
    return response;
  }).catch(async () => (await caches.match(request)) || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
self.addEventListener('push', event => {
  let payload = {}; try { payload = event.data?.json() || {}; } catch (_) {}
  event.waitUntil(self.registration.showNotification(payload.title || 'Express Entregas', {
    body: payload.body || 'Há uma nova solicitação disponível.', icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    tag: payload.tag || 'express-push', silent:false, vibrate:[200,100,200], renotify:false, data: { orderId: payload.orderId, type: payload.type, noticeId:payload.noticeId, alertId:payload.alertId }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('./index.html', self.location.href);
  const orderId = event.notification.data?.orderId;
  if(event.notification.data?.type==='admin-rain')target.hash='rain';
  else if(event.notification.data?.type==='alert')target.hash='alerts';
  else if(event.notification.data?.type==='announcement')target.hash='notices';
  else if(/^[A-Za-z0-9_-]{1,128}$/.test(orderId || ''))target.hash='order='+orderId;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => client.url.startsWith(self.registration.scope));
    if(existing) { await existing.navigate(target.href); return existing.focus(); }
    return self.clients.openWindow(target.href);
  }));
});
