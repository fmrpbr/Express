const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyCommand } = require('../../functions/domain');
const { normalizePix, summary, dayKey, isOverdue } = require('../../functions/payments');
const now = Date.parse('2026-11-16T15:00:00Z');
let seq = 0;
const fixture = () => ({ profiles: { stores: { shop: { name: 'LOJA', address: 'RUA' }, otherShop: { name: 'OUTRA LOJA' } }, couriers: { rider: { name: 'MOTO' }, otherRider: { name: 'OUTRO MOTO' } } }, courierPresence: { rider: { availableForWork: true } }, orders: { completed: { status: 'done', storeId: 'shop', storeName: 'LOJA', courierId: 'rider', courierName: 'MOTO', fee: 7, paid: false, completed: now, revision: 1 } } });
function run(state, uid, action, input = {}, orderId = 'completed', extra = {}) {
  const command = { requestId: 'pay_' + ++seq, action, input, ...(orderId ? { orderId } : {}) };
  return applyCommand(state, { uid, token: {} }, command, { now, newId: 'newOrder', token: 'a'.repeat(64), fingerprint: JSON.stringify(command), ...extra });
}
const pix = { type: 'email', key: '  Moto.Pix@Example.com ', holder: 'Motoboy Teste' };

test('somente loja informa e somente motoboy confirma, nas duas projeções privadas', () => {
  let state = fixture();
  assert.throws(() => run(state, 'rider', 'confirm-payment'), /lojista/);
  for (const uid of ['rider', 'otherShop', 'otherRider']) assert.throws(() => run(state, uid, 'report-payment'), /outra loja/);
  state = run(state, 'shop', 'report-payment').state;
  assert.equal(state.orders.completed.paid, false);
  assert.equal(state.orders.completed.paymentReportedBy, 'shop');
  assert.equal(state.storeOrders.shop.completed.paymentStatus, 'reported');
  assert.equal(state.courierOrders.rider.completed.paymentStatus, 'reported');
  for (const uid of ['shop', 'otherShop', 'otherRider']) assert.throws(() => run(state, uid, 'confirm-payment'), /outro motoboy/);
  state = run(state, 'rider', 'confirm-payment', {}, 'completed', { now: now + 1000 }).state;
  assert.equal(state.orders.completed.paid, true);
  assert.equal(state.orders.completed.paymentConfirmedBy, 'rider');
  assert.equal(state.orders.completed.paymentReportedAt, now);
  assert.equal(state.storeOrders.shop.completed.paymentConfirmedAt, now + 1000);
  assert.equal(state.courierOrders.rider.completed.paid, true);
});

test('repetições preservam autoria, horários, histórico e notificações de cada etapa', () => {
  let state = run(fixture(), 'shop', 'report-payment').state;
  const count = () => Object.keys(state.orderEvents.completed).length;
  state = run(state, 'shop', 'report-payment', {}, 'completed', { now: now + 1000 }).state;
  assert.equal(count(), 1);
  state = run(state, 'rider', 'confirm-payment').state;
  state = run(state, 'rider', 'confirm-payment', {}, 'completed', { now: now + 2000 }).state;
  state = run(state, 'shop', 'toggle-pay').state;
  assert.equal(count(), 2);
  assert.deepEqual(Object.values(state.pushUpdates).map(p => p.action), ['report-payment', 'confirm-payment']);
  assert.equal(state.orders.completed.paymentConfirmedAt, now);
});

test('admin não substitui partes e pagamento exige entrega concluída', () => {
  const state = fixture();
  for (const action of ['report-payment', 'confirm-payment', 'toggle-pay']) {
    assert.throws(() => applyCommand(state, { uid: 'admin', token: { admin: true } }, { action, requestId: 'admin', orderId: 'completed' }, { now }), /outra loja|outro motoboy/);
  }
  state.orders.completed.status = 'run';
  assert.throws(() => run(state, 'shop', 'report-payment'), /Conclua/);
});

test('Pix é privado, normaliza e atualiza apenas pendências ainda não informadas', () => {
  let state = fixture();
  state.orders.oldPaid = { ...state.orders.completed, paid: true, paymentPix: { key: 'paid@example.com' } };
  state.orders.reported = { ...state.orders.completed, paymentStatus: 'reported', paymentPix: { key: 'used@example.com' } };
  state = run(state, 'rider', 'savePix', pix, null).state;
  assert.deepEqual(state.profiles.couriers.rider.pix, { type: 'email', key: 'moto.pix@example.com', holder: 'MOTOBOY TESTE', updatedAt: now });
  assert.equal(state.storeOrders.shop.completed.paymentPix.key, 'moto.pix@example.com');
  assert.equal(state.orders.oldPaid.paymentPix.key, 'paid@example.com');
  assert.equal(state.orders.reported.paymentPix.key, 'used@example.com');
  assert.ok(!JSON.stringify(state.publicTracking || {}).includes('moto.pix'));
  assert.ok(!JSON.stringify(state.availableOrders || {}).includes('moto.pix'));
  state = run(state, 'shop', 'report-payment').state;
  state = run(state, 'rider', 'savePix', { ...pix, key: 'new@example.com' }, null).state;
  assert.equal(state.orders.completed.paymentPix.key, 'moto.pix@example.com');
  assert.throws(() => run(state, 'shop', 'savePix', pix, null), /Somente/);
});

test('validação Pix preserva caixa adequada e rejeita entradas malformadas', () => {
  assert.equal(normalizePix({ ...pix, type: 'cpf', key: '123.456.789-09' }).key, '12345678909');
  assert.equal(normalizePix({ ...pix, type: 'cnpj', key: '12.345.678/0001-95' }).key, '12345678000195');
  assert.equal(normalizePix({ ...pix, type: 'phone', key: '(27) 99999-9999' }).key, '+5527999999999');
  assert.equal(normalizePix({ ...pix, type: 'phone', key: '+351 912345678' }).key, '+351912345678');
  assert.equal(normalizePix({ ...pix, type: 'random', key: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' }).key, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  for (const input of [{ ...pix, key: '<script>' }, { ...pix, holder: '' }, { ...pix, type: 'cpf', key: '11111111111' }, { ...pix, type: 'random', key: 'abcdef' }, { ...pix, type: 'phone', key: '1234' }, { ...pix, type: 'unsupported' }]) assert.throws(() => normalizePix(input));
});

test('pagamentos antigos permanecem pagos sem gerar nova confirmação', () => {
  const legacy = fixture(); legacy.orders.completed.paid = true;
  let state = run(legacy, 'shop', 'report-payment').state;
  state = run(state, 'rider', 'confirm-payment').state;
  assert.equal(state.orders.completed.paid, true);
  assert.equal(state.orders.completed.paymentConfirmedBy, undefined);
  assert.equal(state.orderEvents, undefined);
});

test('virada do dia usa Aracruz e totais não somam informado como recebido', () => {
  const completed = Date.parse('2026-11-16T02:59:59Z');
  const after = Date.parse('2026-11-16T03:00:00Z');
  const orders = [
    { status: 'done', fee: 0.1, completed, paid: true },
    { status: 'done', fee: 0.2, completed, paymentStatus: 'reported' },
    { status: 'done', fee: 7, completed },
    { status: 'run', fee: 999, completed }
  ];
  assert.equal(dayKey(completed), '2026-11-15');
  assert.equal(isOverdue(orders[1], completed), false);
  assert.equal(isOverdue(orders[1], after), true);
  assert.deepEqual(summary(orders, after), { count: 3, total: 7.3, received: 0.1, pending: 7.2, reported: 0.2, reportedCount: 1, overdue: 7.2, overdueCount: 2 });
});

test('pagamento para conferir gera alerta no resultado do aceite sem ocupar vaga ou bloquear', () => {
  let state = run(fixture(), 'shop', 'report-payment').state;
  state.orders.newOrder = { status: 'open', storeId: 'shop', storeName: 'LOJA', fee: 7, revision: 1 };
  const accepted = run(state, 'rider', 'accept', {}, 'newOrder');
  assert.equal(accepted.result.paymentReviewCount, 1);
  assert.equal(accepted.state.orders.newOrder.status, 'run');
  assert.equal(accepted.state.courierPresence.rider.occupiedSlots, 1);
});
