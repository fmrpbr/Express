import { initializeApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator, forceWebSockets, ref, onValue } from 'firebase/database';
import { embedLocation, trackingView } from './view-model.mjs';

const token = location.hash.startsWith('#track=') ? location.hash.slice(7) : '';
const $ = id => document.getElementById(id);
const valid = /^[a-f0-9]{64}$/.test(token);
let unsubscribe, connectionSubscription, latest, timer, connected = false, closed = false, polling = false;
let route, routeInFlight = false, lastRouteRequest = 0, queriedPosition = 0, routeAttempted = false;
let audio, sound = false, shownMap, mapAt = 0;
const arrivals = new Set();
const mapsKey = __EXPRESS_TRACKING_MAPS_KEY__;
const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const milestoneFormat=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
const distanceFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function signalArrival() {
  if (!sound || audio?.state !== 'running') return;
  const start = audio.currentTime;
  [660, 880].forEach((frequency, index) => {
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    const at = start + index * .18;
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(.13, at);
    volume.gain.exponentialRampToValueAtTime(.001, at + .2);
    tone.connect(volume).connect(audio.destination);
    tone.start(at);
    tone.stop(at + .21);
  });
}

$('sound').addEventListener('click', async () => {
  if (sound) {
    sound = false;
  } else {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      audio ||= new Audio();
      await audio.resume();
      sound = audio.state === 'running';
    } catch { sound = false; }
  }
  $('sound').setAttribute('aria-pressed', String(sound));
  $('sound').textContent = sound ? 'Desativar som' : 'Ativar aviso sonoro';
  $('sound-status').textContent = sound ? 'Som ativado enquanto esta página estiver aberta.' : '';
});

function renderCurrent() {
  const view = trackingView(latest, Date.now(), route);
  render(view);
  if (!view.ended) void updateRoute(view);
}

async function updateRoute(view) {
  const now = Date.now();
  const position = view.location?.updatedAt;
  if (!view.toCustomer || view.arrived || view.stale || !position || position === queriedPosition ||
      routeInFlight || now - lastRouteRequest < 47_000) return;
  routeInFlight = true;
  lastRouteRequest = now;
  queriedPosition = position;
  try {
    const result = await fetch('./rota', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }), cache: 'no-store', signal: AbortSignal.timeout(12000),
    });
    if (result.ok && !closed) {
      const next = (await result.json()).estimate;
      if (next?.phase === latest?.phase) route = next;
    }
  } catch { /* A página continua mostrando a última posição recebida. */ }
  finally {
    routeInFlight = false;
    routeAttempted = true;
    if (!closed) render(trackingView(latest, Date.now(), route));
  }
}

function render(view) {
  if (view.arrived && !arrivals.has(view.phase)) {
    arrivals.add(view.phase);
    signalArrival();
  }
  const arrivalVisible = !view.ended && view.toCustomer && arrivals.has(view.phase);
  if (arrivalVisible && !view.arrived) view = { ...view, arrived: true, status: 'Seu motoboy chegou', detail: 'O motoboy está no local da entrega ou retirada.', estimate: null };
  $('status').textContent = view.status;
  $('detail').textContent = view.detail;
  $('code').textContent = [view.code,view.service].filter(Boolean).join(' · ');
  $('tracking-status').classList.toggle('arrived', Boolean(view.arrived));
  $('time').textContent = view.location ? (view.stale ? 'GPS sem atualização recente · ' : 'Última posição · ') + timeFormat.format(view.location.updatedAt)
    : Number.isFinite(view.updatedAt)&&view.updatedAt>0 ? 'Última atualização · ' + milestoneFormat.format(view.updatedAt) : '';
  $('steps-block').hidden=!view.milestones?.length;
  $('steps').replaceChildren(...(view.milestones||[]).map(([label,at])=>{
    const item=document.createElement('li');
    const event=document.createElement('strong');event.textContent=label;
    const time=document.createElement('time');time.dateTime=new Date(at).toISOString();time.textContent=milestoneFormat.format(at);
    item.append(event,time);return item;
  }));
  $('sound').hidden = Boolean(view.ended);
  if (view.ended) $('sound-status').textContent = '';
  $('metrics').hidden = !view.toCustomer || Boolean(view.arrived);
  const estimate = view.estimate;
  $('route-missing').hidden = Boolean(estimate);
  $('route-missing').textContent = view.stale ? 'Aguardando uma posição mais recente do motoboy.' : !view.location ? 'Aguardando a primeira posição do motoboy.' :
    routeAttempted ? 'A previsão fica disponível quando o trajeto puder ser calculado.' : 'Calculando o trajeto…';
  $('route-numbers').hidden = !estimate;
  if (estimate) {
    $('distance').textContent = estimate.meters < 1000 ? `${estimate.meters} m` : `${distanceFormat.format(estimate.meters / 1000)} km`;
    $('eta').textContent = `Cerca de ${Math.max(1, Math.ceil(estimate.seconds / 60))} min`;
  }

  const now = Date.now();
  const frame = $('map-frame');
  const embed = embedLocation(view, mapsKey);
  const mode = view.destination && !view.stale && !view.arrived ? 'route' : 'position';
  $('map-block').hidden = !view.location;
  if (!embed && frame.hasAttribute('src')) { frame.removeAttribute('src'); shownMap = null; }
  if (embed && (!shownMap || shownMap.mode !== mode || shownMap.url !== embed && now - mapAt >= 35_000)) {
    frame.src = embed;
    shownMap = { mode, url: embed };
    mapAt = now;
  }
  frame.hidden = !embed;
  if (view.location) {
    const { lat, lng } = view.location;
    $('map').href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  } else $('map').removeAttribute('href');
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
    unsubscribe = onValue(ref(db, 'publicTracking/' + token), snap => { if(closed) return; latest = snap.val(); renderCurrent(); }, () => render(trackingView(null)));
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
      renderCurrent();
      if(!closed) $('connection').textContent = 'Atualização a cada 10 s';
    } catch (_) { if(!closed) $('connection').textContent = 'Aguardando conexão'; }
    finally { polling = false; }
  }
  timer = setInterval(() => { if(latest) renderCurrent(); void poll(); }, 10000);
  void poll();
}
window.addEventListener('pagehide', () => { closed = true; unsubscribe?.(); connectionSubscription?.(); clearInterval(timer); });
window.addEventListener('pageshow', event => { if(event.persisted) location.reload(); });
