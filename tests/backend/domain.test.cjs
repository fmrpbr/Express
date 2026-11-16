const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyCommand } = require('../../functions/domain');
const now = Date.parse('2026-11-16T15:00:00Z');
const auth = uid => ({ uid, token: { email: uid + '@example.test' } });
function fixture() { return {
  profiles: { stores: { storeA: { name: 'LOJA A', address: 'RUA DA LOJA', phone: '27999999999' }, storeB: { name: 'LOJA B' } }, couriers: { courierA: { name: 'MOTOBOY A' }, courierB: { name: 'MOTOBOY B' } } },
  courierPresence: { courierA: { registered: true, busy: false, availableForWork: true }, courierB: { registered: true, busy: false, availableForWork: true } }
}; }
const input = extra => ({ serviceType: 'delivery', serviceDate: '2026-11-16', city: 'Aracruz', clientNeighborhood: 'Centro', client: 'CLIENTE PRIVADO', phone: '27999999999', clientStreet: 'RUA PRIVADA', clientNumber: '30', selectedZone: '', paymentMethod: 'money', ...extra });
let nextId = 0;
function run(state, uid, action, orderId = null, data = {}, overrides = {}) {
  const requestId = overrides.requestId || 'request_' + ++nextId;
  const command = { requestId, action, ...(orderId ? { orderId } : {}), input: data };
  return applyCommand(state, auth(uid), command, { now, newId: 'orderA', token: 'a'.repeat(64), fingerprint: JSON.stringify(command), ...overrides });
}
const create = (state = fixture(), extra) => run(state, 'storeA', 'saveOrder', null, input(extra)).state;

test('pedido ignora campos forjados e gera projeção mínima sem cliente, telefone, endereço ou UID', () => {
  const state = create(fixture(), { fee: 0.01, courierId: 'attacker', paid: true, storeId: 'storeB' });
  assert.equal(state.orders.orderA.fee, 7);
  assert.equal(state.orders.orderA.storeId, 'storeA');
  assert.equal(state.orders.orderA.paid, false);
  assert.equal(state.orders.orderA.courierId, undefined);
  assert.equal(state.storeOrders.storeA.orderA.client, 'CLIENTE PRIVADO');
  assert.deepEqual(Object.keys(state.availableOrders.orderA).filter(k => /client$|phone|Street|Number|storeId|courierId|tracking/i.test(k)), []);
});
test('recibo evita pedido e evento duplicados e rejeita reuso para outra operação', () => {
  const id = 'same_request';
  const first = run(fixture(), 'storeA', 'saveOrder', null, input(), { requestId: id });
  const second = run(first.state, 'storeA', 'saveOrder', null, input(), { requestId: id });
  assert.deepEqual(second.state, first.state);
  assert.equal(Object.keys(second.state.orders).length, 1);
  assert.throws(() => run(second.state, 'storeA', 'saveOrder', null, input({ client: 'OUTRO' }), { requestId: id }), /reutilizado/);
});
test('loja B e visitante não editam nem confirmam pedido da loja A', () => {
  const state = create();
  assert.throws(() => run(state, 'storeB', 'saveOrder', 'orderA', input()), /outra loja/);
  assert.throws(() => run(state, 'visitor', 'toggle-pay', 'orderA'), /Perfil/);
  assert.throws(() => applyCommand(state, null, {}, {}), /Entre/);
});
test('pedido mantém um único motoboy; motoboy aceita duas corridas e a terceira é bloqueada', () => {
  let state = create();
  state = run(state, 'courierA', 'accept', 'orderA').state;
  assert.equal(state.courierPresence.courierA.busy, true);
  assert.equal(state.availableOrders.orderA, undefined);
  assert.throws(() => run(state, 'courierB', 'accept', 'orderA'), /já aceita/);
  state = run(state, 'storeA', 'saveOrder', null, input(), { newId: 'orderB' }).state;
  state = run(state, 'courierA', 'accept', 'orderB').state;
  assert.equal(state.orders.orderA.queuePosition, 1);
  assert.equal(state.orders.orderB.queuePosition, 2);
  assert.equal(state.courierPresence.courierA.occupiedSlots, 2);
  state = run(state, 'storeA', 'saveOrder', null, input(), { newId: 'orderC' }).state;
  assert.throws(() => run(state, 'courierA', 'accept', 'orderC'), /duas corridas/);
});
test('cotação reservada ocupa vaga, seu aceite não conta duas vezes e cancelamento libera a vaga', () => {
  let state = run(create(), 'courierA', 'accept', 'orderA').state;
  state = run(state, 'storeA', 'saveOrder', null, input({isQuote:true}), {newId:'quoteB'}).state;
  state = run(state, 'courierA', 'send-bid', 'quoteB', {amount:25}).state;
  state = run(state, 'storeA', 'accept-bid', 'quoteB', {courierId:'courierA',amount:25}).state;
  assert.equal(state.courierPresence.courierA.occupiedSlots, 2);
  state = run(state, 'storeA', 'saveOrder', null, input(), {newId:'orderC'}).state;
  assert.throws(() => run(state,'courierA','accept','orderC'), /duas corridas/);
  state = run(state,'storeA','saveOrder','quoteB',input()).state;
  state = run(state,'courierA','accept','quoteB').state;
  assert.equal(state.courierPresence.courierA.occupiedSlots,2);
  state = run(state,'courierA','cancel','quoteB').state;
  assert.equal(state.courierPresence.courierA.occupiedSlots,1);
  assert.equal(run(state,'courierA','accept','orderC').state.orders.orderC.status,'run');
});
test('prioridade muda apenas pelo dono e promove a próxima ao concluir; cada rastreio recebe só sua posição', () => {
  let state = run(create(), 'courierA', 'accept', 'orderA').state;
  state = run(state,'storeA','saveOrder',null,input(),{newId:'orderB'}).state;
  state = run(state,'courierA','accept','orderB').state;
  state = run(state,'storeA','tracking','orderA',{}, {token:'a'.repeat(64)}).state;
  state = run(state,'storeA','tracking','orderB',{}, {token:'b'.repeat(64)}).state;
  assert.throws(() => run(state,'courierB','focus','orderB'), /outro motoboy/);
  assert.throws(() => run(state,'storeA','focus','orderB'), /outro motoboy/);
  state = run(state,'courierA','focus','orderB').state;
  assert.equal(state.publicTracking['a'.repeat(64)].queuePosition,2);
  assert.equal(state.publicTracking['b'.repeat(64)].queuePosition,1);
  for(const p of Object.values(state.publicTracking)) assert.ok(!JSON.stringify(p).includes('orderA') && !JSON.stringify(p).includes('orderB'));
  state = run(state,'courierA','location','orderB',{lat:-19.8,lng:-40.2}).state;
  assert.deepEqual(state.orders.orderA.location,state.orders.orderB.location);
  assert.deepEqual(state.publicTracking['a'.repeat(64)].location,state.publicTracking['b'.repeat(64)].location);
  state = run(state,'courierA','picked','orderB').state;
  state = run(state,'courierA','finish','orderB').state;
  assert.equal(state.orders.orderA.queuePosition,1);
  assert.equal(state.courierPresence.courierA.occupiedSlots,1);
  assert.equal(state.courierPresence.courierA.busy,true);
  assert.ok(!state.publicTracking['b'.repeat(64)]);
  state = run(state,'courierA','cancel','orderA').state;
  assert.equal(state.courierPresence.courierA.occupiedSlots,0);
  assert.ok(!state.courierLocations.courierA);
});
test('cancelamento de 25 minutos usa relógio do servidor e exige ausência de retirada', () => {
  let state = run(create(), 'courierA', 'accept', 'orderA').state;
  assert.throws(() => run(state, 'storeA', 'cancel-free', 'orderA', {}, { now: now + 1499999 }), /25 minutos/);
  const picked = run(state, 'courierA', 'picked', 'orderA').state;
  assert.throws(() => run(picked, 'storeA', 'cancel-free', 'orderA', {}, { now: now + 1500000 }), /25 minutos/);
  state = run(state, 'storeA', 'cancel-free', 'orderA', {}, { now: now + 1500000 }).state;
  assert.equal(state.orders.orderA.status, 'cancelled');
  assert.equal(state.courierPresence.courierA.busy, false);
});
test('cotação preserva contratado e valor; cancelamento retorna à cotação sem atribuição antiga', () => {
  let state = create(fixture(), { isQuote: true });
  state = run(state, 'courierA', 'send-bid', 'orderA', { amount: 25 }).state;
  const accepted = run(state, 'storeA', 'accept-bid', 'orderA', { courierId: 'courierA', amount: 25 });
  assert.equal(accepted.result.order.agreedFee, 25);
  assert.equal(accepted.result.order.assignedCourierId, 'courierA');
  state = accepted.state;
  assert.throws(() => run(state, 'storeA', 'accept-bid', 'orderA', { courierId: 'courierA', amount: 25 }), /já aceita/);
  state = run(state, 'storeA', 'saveOrder', 'orderA', input({ fee: 1 })).state;
  assert.equal(state.orders.orderA.fee, 25);
  assert.equal(state.orders.orderA.assignedCourierId, 'courierA');
  assert.equal(state.availableOrders.orderA, undefined);
  assert.throws(() => run(state, 'courierB', 'accept', 'orderA'), /reservada/);
  state = run(state, 'courierA', 'accept', 'orderA', { rain: true }).state;
  assert.equal(state.orders.orderA.fee, 25);
  state = run(state, 'courierA', 'cancel', 'orderA').state;
  assert.equal(state.orders.orderA.status, 'cotacao');
  assert.equal(state.orders.orderA.courierId, undefined);
  assert.equal(state.courierOrders.courierA.orderA, undefined);
  assert.equal(state.quoteBoard.orderA.status, 'cotacao');
  assert.deepEqual(state.orders.orderA.bids, {});
});
test('roundtrip legado mantém as três etapas e seu preço original', () => {
  let legacy=create();legacy.orders.orderA.serviceType='roundtrip';legacy.storeOrders.storeA.orderA.serviceType='roundtrip';
  let state = run(legacy, 'courierA', 'accept', 'orderA').state;
  assert.throws(() => run(state, 'courierA', 'roundtrip-step', 'orderA', { step: 2 }), /Etapa/);
  assert.throws(() => run(state, 'courierA', 'finish', 'orderA'), /etapas/);
  for (let step = 1; step <= 3; step++) state = run(state, 'courierA', 'roundtrip-step', 'orderA', { step }).state;
  assert.throws(() => run(state, 'courierA', 'cancel', 'orderA'), /após retirada/);
  state = run(state, 'courierA', 'finish', 'orderA', {}, { now: now + 600000 }).state;
  assert.equal(state.orders.orderA.durationMs, 600000);
  assert.equal(state.courierPresence.courierA.busy, false);
});
test('pagamento sincroniza e preserva primeira autoria em confirmações repetidas', () => {
  let state = run(create(), 'courierA', 'accept', 'orderA').state;
  assert.throws(() => run(state, 'storeA', 'toggle-pay', 'orderA'), /Conclua/);
  state = run(state, 'courierA', 'picked', 'orderA').state;
  state = run(state, 'courierA', 'finish', 'orderA').state;
  assert.throws(() => run(state, 'courierA', 'toggle-pay', 'orderA'), /lojista/);
  state = run(state, 'storeA', 'toggle-pay', 'orderA').state;
  assert.equal(state.orders.orderA.paid, false);
  assert.equal(state.orders.orderA.paymentStatus, 'reported');
  const reported = state.orders.orderA.paymentReportedAt;
  state = run(state, 'courierA', 'toggle-pay', 'orderA', {}, { now: now + 5000 }).state;
  const confirmed = state.orders.orderA.paymentConfirmedAt;
  state = run(state, 'courierA', 'toggle-pay', 'orderA', {}, { now: now + 10000 }).state;
  state = run(state, 'storeA', 'toggle-pay', 'orderA', {}, { now: now + 11000 }).state;
  assert.equal(state.orders.orderA.paymentConfirmedBy, 'courierA');
  assert.equal(state.orders.orderA.paymentReportedAt, reported);
  assert.equal(state.orders.orderA.paymentConfirmedAt, confirmed);
  assert.equal(state.courierOrders.courierA.orderA.paid, true);
});
test('rastreio tem token mínimo, expira, pode ser revogado e é removido ao concluir', () => {
  let state = run(create(), 'courierA', 'accept', 'orderA').state;
  state = run(state, 'storeA', 'tracking', 'orderA').state;
  assert.equal(state.publicTracking['a'.repeat(64)].expiresAt, now + 86400000);
  state = run(state, 'courierA', 'location', 'orderA', { lat: -19.8, lng: -40.3 }).state;
  assert.equal(state.publicTracking['a'.repeat(64)].location.updatedAt, now);
  assert.throws(() => run(state, 'courierB', 'location', 'orderA', { lat: 0, lng: 0 }), /outro motoboy/);
  assert.throws(() => run(state, 'courierA', 'location', 'orderA', { lat: 0, lng: 0 }), /Aguarde/);
  state = run(state, 'storeA', 'tracking', 'orderA', { revoke: true }).state;
  assert.equal(state.publicTracking['a'.repeat(64)], undefined);
  state = run(state, 'storeA', 'tracking', 'orderA').state;
  state = run(state, 'courierA', 'picked', 'orderA').state;
  state = run(state, 'courierA', 'finish', 'orderA').state;
  assert.equal(state.publicTracking['a'.repeat(64)], undefined);
  assert.throws(() => run(state, 'courierA', 'location', 'orderA', { lat: 0, lng: 0 }), /encerrado/);
});
test('loja não altera tarifas ou cria perfil administrativo', () => {
  assert.throws(() => run(fixture(), 'storeA', 'saveRates', null, { zones: { X: 1 } }), /administrativo/);
  assert.throws(() => run(fixture(), 'visitor', 'createProfile', null, { role: 'admin', name: 'TESTE', phone: '27999999999' }), /Perfil inválido/);
});
module.exports = { fixture, input };
test('confirmações de pagamento repetidas não duplicam evento de pagamento', () => {
  let state=run(create(),'courierA','accept','orderA').state;
  state=run(state,'courierA','picked','orderA').state;
  state=run(state,'courierA','finish','orderA').state;
  state=run(state,'storeA','toggle-pay','orderA').state;
  state=run(state,'courierA','toggle-pay','orderA').state;
  const before=Object.keys(state.orderEvents.orderA).length;
  state=run(state,'courierA','toggle-pay','orderA').state;
  assert.equal(Object.keys(state.orderEvents.orderA).length,before);
});
test('migração offline preserva pedidos e perfis, revoga links antigos e deixa equipe em OFF', () => {
  const {migrate}=require('../../scripts/migrate-test-snapshot.cjs');
  const source={stores:{storeA:{name:'Loja',address:'Rua'}},couriers:{courierA:{name:'Moto'}},orders:{legacy:{storeId:'storeA',courierId:'courierA',status:'run',orderCode:'EXP-OLD',serviceType:'delivery',trackingToken:'old',fee:25}},publicTracking:{old:{client:'PRIVADO'}}};
  const {state,review}=migrate(source,now);
  assert.equal(review.length,0);
  assert.equal(state.storeOrders.storeA.legacy.fee,25);
  assert.equal(state.courierPresence.courierA.availableForWork,false);
  assert.equal(state.courierPresence.courierA.busy,true);
  assert.deepEqual(state.publicTracking,{});
  assert.equal(source.orders.legacy.trackingToken,'old');
});
test('renovação de token e troca de conta não mantêm o aparelho na conta anterior', () => {
  let state=run(fixture(),'courierA','registerDevice',null,{deviceId:'device_one',token:'a'.repeat(30)}).state;
  state=run(state,'storeA','registerDevice',null,{deviceId:'device_one',token:'b'.repeat(30)}).state;
  assert.equal(Object.keys(state.fcmTokens.courierA).length,0);
  assert.equal(Object.values(state.fcmTokens.storeA)[0].token,'b'.repeat(30));
  assert.throws(()=>run(state,'visitor','registerDevice',null,{deviceId:'device_one',token:'c'.repeat(30)}),/Perfil/);
});
test('Web Push não aceita endpoint arbitrário, credenciais na URL ou porta interna', () => {
  const {validWebEndpoint}=require('../../functions/notifications');
  assert.equal(validWebEndpoint('https://fcm.googleapis.com/fcm/send/fake'),true);
  for(const url of ['https://127.0.0.1/private','https://fcm.googleapis.com.attacker.test/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:9000/x']) assert.equal(validWebEndpoint(url),false);
});

test('notification channel schema is validated server-side; web registration transfers one browser without sharing accounts',()=>{
 const P=require('../../functions/notification-policy');
 const native=run(fixture(),'courierA','registerDevice',null,{token:'token-example-123456789012345',deviceId:'device',notificationSchema:P.SCHEMA});
 assert.equal(native.result.notificationSchema,P.SCHEMA);
 assert.equal(Object.values(native.state.fcmTokens.courierA)[0].notificationSchema,P.SCHEMA);
 const endpoint='https://fcm.googleapis.com/fcm/send/browser';
 const web=run(native.state,'storeA','registerWebDevice',null,{endpoint,keys:{p256dh:'a'.repeat(40),auth:'b'.repeat(20)},deviceId:'browser'});
 const moved=run(web.state,'courierB','registerWebDevice',null,{endpoint,keys:{p256dh:'a'.repeat(40),auth:'b'.repeat(20)},deviceId:'browser'});
 assert.equal(Object.keys(moved.state.pushSubscriptions.storeA||{}).length,0);
 assert.equal(Object.keys(moved.state.pushSubscriptions.courierB).length,1);
 assert.throws(()=>run(fixture(),'storeA','registerWebDevice',null,{endpoint:'https://evil.example/private',keys:{p256dh:'a'.repeat(40),auth:'b'.repeat(20)},deviceId:'browser'}));
 assert.equal(moved.state.notificationAccounts.courierB.role,'courier');
});

test('rain push is limited to registered administrators after two distinct couriers and never activates the fee',()=>{
 const state=fixture();state.notificationAccounts={admin:{role:'admin'},storeA:{role:'store'}};
 const first=run(state,'courierA','signalRain').state;assert.equal(Object.keys(first.pushUpdates||{}).length,0);
 const second=run(first,'courierB','signalRain').state;
 const event=Object.values(second.pushUpdates)[0];assert.deepEqual(event.recipients,['admin']);assert.equal(event.action,'rain-signal');assert.equal(second.config.rainPlans,undefined);
});
