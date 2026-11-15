import { initializeApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator, ref, onValue } from 'firebase/database';
import { trackingView } from './view-model.mjs';

const token = location.hash.startsWith('#track=') ? location.hash.slice(7) : '';
const $ = id => document.getElementById(id);
const valid = /^[a-f0-9]{64}$/.test(token);
let unsubscribe, connectionSubscription, latest, timer;
function render(view) {
  $('status').textContent = view.status;
  $('detail').textContent = view.detail;
  $('code').textContent = view.code || '';
  $('time').textContent = view.locationAt ? (view.stale ? 'Sinal sem atualização recente. Última posição: ' : 'Última posição: ') + new Date(view.locationAt).toLocaleString('pt-BR') : '';
  $('map').hidden = !view.map;
  if (view.map) $('map').href = view.map; else $('map').removeAttribute('href');
  if(view.ended) {
    $('connection').textContent = 'Encerrado';
    unsubscribe?.(); connectionSubscription?.(); clearInterval(timer);
  }
}
if (!valid) render({ status: 'Link inválido', detail: 'Peça à loja um novo link de acompanhamento.', ended: true });
else {
  const app = initializeApp(__EXPRESS_PUBLIC_FIREBASE__);
  const db = getDatabase(app);
  if (['localhost', '127.0.0.1'].includes(location.hostname)) connectDatabaseEmulator(db, '127.0.0.1', 9000);
  connectionSubscription = onValue(ref(db, '.info/connected'), snap => { $('connection').textContent = snap.val() ? 'Atualização ao vivo' : 'Reconectando'; });
  unsubscribe = onValue(ref(db, 'publicTracking/' + token), snap => { latest = snap.val(); render(trackingView(latest)); }, () => render(trackingView(null)));
  timer = setInterval(() => { if(latest) render(trackingView(latest)); }, 10000);
}
window.addEventListener('pagehide', () => { unsubscribe?.(); connectionSubscription?.(); clearInterval(timer); });
