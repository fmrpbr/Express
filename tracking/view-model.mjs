const GPS_MAX_AGE = 120_000;
const ESTIMATE_MAX_AGE = 100_000;

export function validPoint(point) {
  return Number.isFinite(point?.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
}

export function trackingView(data, now = Date.now(), route = null) {
  if (!data || data.revoked !== false || !Number.isFinite(data.expiresAt) || data.expiresAt <= now)
    return { status: 'Rastreamento encerrado', detail: 'O link expirou ou foi encerrado.', ended: true };
  const code = typeof data.orderCode === 'string' ? data.orderCode.slice(0, 60) : '';
  if (['done', 'route_done'].includes(data.status))
    return { status: 'Entrega concluída', detail: 'O motoboy finalizou a entrega.', completedAt: data.completedAt, code, ended: true };
  if (['cancelled', 'route_cancelled'].includes(data.status))
    return { status: 'Entrega cancelada', detail: 'Fale com a loja para mais informações.', code, ended: true };
  if (!['open', 'run'].includes(data.status))
    return { status: 'Rastreamento encerrado', detail: 'Este pedido não está disponível para acompanhar.', code, ended: true };

  const phase = data.phase || (data.status === 'open' ? 'open' : Number(data.queuePosition) > 1 ? 'queued' : 'legacy');
  const toCustomer = ['to-pickup', 'to-delivery'].includes(phase);
  const location = (toCustomer || phase === 'legacy') && validPoint(data.location) && Number.isFinite(data.location.updatedAt) &&
    data.location.updatedAt <= now + 60_000 ? data.location : null;
  const stale = location && now - location.updatedAt > GPS_MAX_AGE;
  const latestRoute = toCustomer && location && route?.phase === phase && validPoint(route.destination) ? route : null;
  const estimate = latestRoute && !stale && now - route.calculatedAt <= ESTIMATE_MAX_AGE &&
    Number.isFinite(route.meters) && route.meters >= 0 && Number.isFinite(route.seconds) && route.seconds >= 0 ? route : null;
  const gpsArrival = estimate && estimate.meters <= 55 && location.accuracy > 0 && location.accuracy <= 30 &&
    estimate.locationAt === location.updatedAt;
  const arrived = toCustomer && (Boolean(data.arrivedAt) || Boolean(gpsArrival));
  const messages = {
    open: ['Aguardando motoboy', 'A loja solicitou sua entrega.'],
    queued: ['Você é a próxima entrega', 'O motoboy está atendendo outra parada.'],
    'at-store': ['Pedido em atendimento', 'O motoboy está na etapa da loja.'],
    'to-delivery': ['Motoboy a caminho', 'Sua entrega saiu para o endereço informado.'],
    'to-pickup': ['Motoboy a caminho da retirada', 'O motoboy está indo ao endereço informado.'],
    legacy: ['Pedido em atendimento', 'Acompanhe a última posição recebida.'],
  };
  const [status, detail] = arrived ? ['Seu motoboy chegou', 'O motoboy está no local da entrega ou retirada.'] : messages[phase] || messages.legacy;
  return { status, detail, code, phase, toCustomer, arrived, location, stale: Boolean(stale), estimate: arrived ? null : estimate,
    destination: latestRoute?.destination || null, expiresAt: data.expiresAt, ended: false };
}

export function embedLocation(view, key) {
  if (!view.location || !key) return '';
  const { lat, lng } = view.location;
  const query = new URLSearchParams({ key, language: 'pt-BR', region: 'BR' });
  const useRoute = !view.stale && view.destination && !view.arrived;
  if (useRoute) {
    query.set('origin', `${lat},${lng}`);
    query.set('destination', `${view.destination.lat},${view.destination.lng}`);
    query.set('mode', 'driving');
  } else {
    query.set('q', `${lat},${lng}`);
    query.set('zoom', '16');
  }
  return `https://www.google.com/maps/embed/v1/${useRoute ? 'directions' : 'place'}?${query}`;
}
