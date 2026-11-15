export function trackingView(data, now = Date.now()) {
  if (!data || data.revoked !== false || !Number.isFinite(data.expiresAt) || data.expiresAt <= now || !['open', 'run'].includes(data.status))
    return { status: 'Rastreamento encerrado', detail: 'O link expirou, foi encerrado ou não está disponível.', ended: true };
  const waiting = data.status === 'open';
  const queued = data.status === 'run' && Number(data.queuePosition) === 2;
  const location = data.location;
  const validLocation = !waiting && location && Number.isFinite(location.lat) && Math.abs(location.lat) <= 90 &&
    Number.isFinite(location.lng) && Math.abs(location.lng) <= 180 && Number.isFinite(location.updatedAt) && location.updatedAt <= now + 60000;
  const stale = validLocation && now - location.updatedAt > 120000;
  return {
    status: waiting ? 'Aguardando motoboy' : queued ? 'Você é a próxima entrega' : 'Sua entrega está em atendimento',
    detail: waiting ? 'A loja já solicitou sua entrega. Aguarde a confirmação de um motoboy.' : queued ?
      'O motoboy está atendendo outra entrega. A prioridade pode ser ajustada durante o trajeto.' :
      'O motoboy está atendendo sua solicitação. A posição será atualizada quando houver sinal de GPS.',
    code: typeof data.orderCode === 'string' ? data.orderCode.slice(0, 60) : 'Entrega Express',
    map: validLocation ? `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}` : null,
    locationAt: validLocation ? location.updatedAt : null,
    stale: !!stale, expiresAt: data.expiresAt, ended: false
  };
}
