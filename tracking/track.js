import { initializeApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator, forceWebSockets, ref, onValue } from 'firebase/database';
import { trackingView } from './view-model.mjs';

const token = location.hash.startsWith('#track=') ? location.hash.slice(7) : '';
const $ = id => document.getElementById(id);
const valid = /^[a-f0-9]{64}$/.test(token);
let unsubscribe, connectionSubscription, latest, timer, connected = false, closed = false, polling = false;
function render(view) {
  $('status').textContent = view.status;
  $('detail').textContent = view.detail;
  $('code').textContent = view.code || '';
  $('time').textContent = view.locationAt ? (view.stale ? 'Sinal sem atualização recente. Última posição: ' : 'Última posição: ') + new Date(view.locationAt).toLocaleString('pt-BR') : '';
  $('map').hidden = !view.map;
  if (view.map) $('map').href = view.map; else $('map').removeAttribute('href');
  if(view.ended) {
    closed = true;
    $('connection').textContent = 'Encerrado';
    unsubscribe?.(); connectionSubscription?.(); clearInterval(timer);
  }
}
if (!valid) render({ status: 'Link inválido', detail: 'Peça à loja um novo link de acompanhamento.', ended: true });
else {
  const config = __EXPRESS_PUBLIC_FIREBASE__;
  const emulator = ['localhost', '127.0.0.1'].includes(location.hostname);
  const endpoint = emulator ? `http://127.0.0.1:9000/publicTracking/${token}.json?ns=${config.projectId}-default-rtdb` : config.databaseURL + '/publicTracking/' + token + '.json';
  // RTDB long-poll uses executable script frames. Keep a strict CSP instead:
  // WebSocket when available, and read-only HTTPS JSON polling as fallback.
  if(typeof WebSocket === 'function') {
    forceWebSockets();
    const db = getDatabase(initializeApp(config));
    if (emulator) connectDatabaseEmulator(db, '127.0.0.1', 9000);
    connectionSubscription = onValue(ref(db, '.info/connected'), snap => { connected = snap.val() === true; if(!closed) $('connection').textContent = connected ? 'Atualização ao vivo' : 'Reconectando'; });
    unsubscribe = onValue(ref(db, 'publicTracking/' + token), snap => { if(closed) return; latest = snap.val(); render(trackingView(latest)); }, () => render(trackingView(null)));
  }
  async function poll() {
    if(connected || closed || polling) return;
    polling = true;
    try {
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'omit' });
      if(closed || connected) return;
      if([401,403,404].includes(response.status)) { render(trackingView(null)); return; }
      if(!response.ok) throw new Error('Unavailable');
      latest = await response.json();
      if(closed || connected) return;
      render(trackingView(latest));
      if(!closed) $('connection').textContent = 'Atualização a cada 10 s';
    } catch (_) { if(!closed) $('connection').textContent = 'Aguardando conexão'; }
    finally { polling = false; }
  }
  timer = setInterval(() => { if(latest) render(trackingView(latest)); void poll(); }, 10000);
  void poll();
}
window.addEventListener('pagehide', () => { closed = true; unsubscribe?.(); connectionSubscription?.(); clearInterval(timer); });
window.addEventListener('pageshow', event => { if(event.persisted) location.reload(); });
