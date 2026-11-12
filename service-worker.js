const CACHE_NAME = 'express-entregas-v2-testes-c83c2a45';
const APP_SHELL = ['./','./index.html','./firebase-config.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r && r.ok) { const copy=r.clone(); caches.open(CACHE_NAME).then(c=>c.put(e.request,copy)); } return r; }).catch(()=>caches.match(e.request).then(r=>r || caches.match('./index.html'))));
});
self.addEventListener('notificationclick', e => { e.notification.close(); const target=new URL('./',self.location.href).href; e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{ for(const client of list){if('focus' in client)return client.focus();} return self.clients.openWindow ? self.clients.openWindow(target) : undefined; })); });
self.addEventListener('push', e => { let p={}; try{p=e.data?e.data.json():{};}catch(_){} e.waitUntil(self.registration.showNotification(p.title||'Novo pedido no Express Entregas',{body:p.body||'Há uma nova solicitação disponível.',icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',tag:p.tag||'express-push',renotify:true})); });
