const { test, expect } = require('@playwright/test');
const admin = require('../../functions/node_modules/firebase-admin');
let app, db;
const base='http://127.0.0.1:8080/www/';
test.beforeAll(async()=>{
  app=admin.initializeApp({projectId:'demo-express-entregas-browser',databaseURL:'https://demo-express-entregas-browser-default-rtdb.firebaseio.com'},'browser');db=app.database();
  await db.ref().set(null);
});
test.afterAll(async()=>{await app.delete();});
async function register(page,role,email){
  await page.goto(base);
  if(role==='courier') await page.locator('#btn-login-courier').click();
  await page.locator('#tab-register').click();
  await page.locator('#auth-name').fill(role==='courier'?'Motoboy Teste':'Loja Teste');
  await page.locator('#auth-extra').fill('27999999999');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill('test-password-123');
  await page.locator('#auth-submit-btn').click();
  await expect(page.locator('#login-screen')).toBeHidden({timeout:15000});
}
test('cadastro mobile, perfil, pedido, aceite, retirada, conclusão e pagamento sincronizado',async({browser})=>{
  const storeContext=await browser.newContext({viewport:{width:393,height:852}});
  const courierContext=await browser.newContext({viewport:{width:393,height:852}});
  const store=await storeContext.newPage(),courier=await courierContext.newPage();
  const errors=[]; for(const page of [store,courier]) page.on('pageerror',error=>errors.push(error.message));
  await register(store,'store','store-'+Date.now()+'@example.test');
  await store.evaluate(()=>window.__express.setView('profile'));
  await store.locator('#prof-address').fill('Rua da Loja, 1, Centro');
  await store.locator('#store-profile-form button[type=submit]').click();
  await expect(store.locator('#prof-address')).toHaveCount(0);
  await register(courier,'courier','courier-'+Date.now()+'@example.test');
  await courier.locator('[data-nav=profile]').filter({hasText:'Meu Pix'}).click();
  await courier.locator('#pix-type').selectOption('email');
  await courier.locator('#pix-key').fill('Moto.Pix@Example.com');
  await expect(courier.locator('#pix-key')).toHaveValue('Moto.Pix@Example.com');
  await courier.locator('#pix-holder').fill('Titular Teste');
  await courier.locator('#pix-profile-form button[type=submit]').click();
  await expect(courier.locator('#pix-profile-form')).toHaveCount(0);
  await courier.evaluate(()=>window.__express.setView('available'));
  await courier.locator('[data-toggle-availability]').click();
  await expect(courier.locator('[data-toggle-availability]')).toHaveText('PAUSAR');
  await courier.locator('[data-action=push-settings]').click();
  await expect(courier.locator('dialog')).toBeVisible();
  await courier.locator('dialog [name=reminders]').uncheck();
  await courier.locator('dialog button[type=submit]').click();
  await expect(courier.locator('dialog')).toHaveCount(0);
  await store.locator('[data-open-sheet][data-sheet-mode=delivery]').first().click();
  await expect(store.locator('#service-type-select')).toHaveValue('delivery');
  await store.locator('#inp-client').fill('Cliente de Teste');
  await store.locator('#inp-phone').fill('27988888888');
  await store.locator('#inp-street').fill('Rua Particular');
  await store.locator('#inp-number').fill('42');
  await store.locator('#input-neighborhood').fill('Centro');
  await store.locator('#quote-city').fill('Aracruz');
  await store.locator('#zone-select-mobile').selectOption('Shopping Oriundi');
  await store.locator('#chk-bag-mob').check();
  await expect(store.locator('#zone-select-mobile')).toHaveValue('Shopping Oriundi');
  await store.locator('#btn-submit-order').click();
  await expect(store.locator('#order-sheet-overlay')).not.toHaveClass(/active/);
  await expect(courier.locator('[data-action=accept]')).toHaveCount(1);
  await expect(courier.locator('#content')).not.toContainText('RUA PARTICULAR');
  courier.on('dialog',d=>d.dismiss());
  await courier.locator('[data-action=accept]').click();
  await expect(courier.locator('[data-action=picked]')).toHaveCount(1);
  await expect(courier.locator('[data-work-status]')).toHaveText('OCUPADO');
  await expect(courier.locator('#hero-busy')).toHaveText('1');
  await expect(courier.locator('#hero-available')).toHaveText('0');
  await store.locator('#nav [data-nav=run]').click();
  await expect(store.locator('#page-title')).toHaveText('Em execução');
  await expect(store.locator('[data-order-id]')).toHaveCount(1);

  await expect(courier.locator('#content')).toContainText('RUA PARTICULAR');
  await courier.locator('[data-action=picked]').click();
  await expect(courier.locator('[data-action=finish]')).toHaveCount(1);
  await courier.locator('[data-action=finish]').click();
  await expect(courier.locator('[data-action=confirm-payment]')).toHaveCount(0);
  await expect(courier.locator('[data-work-status]')).toHaveText('DISPONÍVEL');
  await expect(courier.locator('#content')).toContainText('Aguardando lojista informar pagamento');
  const [completedId, completedOrder] = Object.entries((await db.ref('orders').get()).val()).find(([,o])=>o.status==='done');
  const previousDay = { ...completedOrder, completed: Date.now()-86400000, revision: completedOrder.revision+1 };
  await db.ref().update({ ['orders/'+completedId]:previousDay, ['storeOrders/'+completedOrder.storeId+'/'+completedId]:previousDay, ['courierOrders/'+completedOrder.courierId+'/'+completedId]:previousDay });
  await expect(courier.locator('#content')).toContainText('Pendência de dia anterior');
  await store.evaluate(()=>window.__express.setView('done'));
  await expect(store.locator('#content')).toContainText('pendência(s) de dias anteriores');
  await expect(store.locator('#content')).toContainText('moto.pix@example.com');
  await storeContext.grantPermissions(['clipboard-read','clipboard-write']);
  await store.locator('[data-action=copy-pix]').click();
  expect(await store.evaluate(()=>navigator.clipboard.readText())).toBe('moto.pix@example.com');
  store.on('dialog', d=>d.accept());
  await store.locator('[data-action=report-payment]').click();
  await expect(store.getByRole('dialog',{name:'Informar pagamento'})).toBeVisible();
  await store.locator('[data-decision=confirm]').click();
  await expect(store.locator('#content')).toContainText('Aguardando confirmação do motoboy');
  await expect(courier.locator('[data-action=confirm-payment]')).toHaveCount(1);
  await expect(courier.locator('#content')).toContainText('pagamento(s) para conferir');
  await courier.reload();
  await expect(courier.locator('#login-screen')).toBeHidden();
  await courier.locator('[data-nav=reports]').filter({hasText:'Conferir pagamentos'}).click();
  await expect(courier.locator('#content')).toContainText('Pendências por dia e lojista');
  await expect(courier.locator('[data-action=confirm-payment]')).toHaveCount(1);
  courier.removeAllListeners('dialog'); courier.on('dialog',d=>d.accept());
  await courier.locator('[data-action=confirm-payment]').click();
  await courier.locator('[data-decision=confirm]').click();
  await expect(store.locator('#content')).toContainText('Pagamento confirmado');
  await expect(courier.locator('#content')).toContainText('Histórico de pagamentos confirmados');
  await expect(courier.locator('[data-action=confirm-payment]')).toHaveCount(0);
  expect(errors).toEqual([]);
  for(const page of [store,courier]) {
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.locator('#nav').evaluate(nav=>nav.scrollWidth<=nav.clientWidth)).toBe(true);
  }
  await storeContext.close();await courierContext.close();
});
test('visitante abre rastreio sem login, recebe atualização e perde acesso ao revogar',async({page})=>{
  const token='b'.repeat(64);
  await db.ref('publicTracking/'+token).set({orderCode:'EXP-TESTE',status:'open',serviceTypeLabel:'Entrega',expiresAt:Date.now()+600000,revoked:false,updatedAt:Date.now()});
  await page.goto(base+'#track='+token);
  await expect(page.locator('#public-track-content')).toContainText('Aguardando motoboy');
  await db.ref('publicTracking/'+token).update({status:'run',location:{lat:-19.8,lng:-40.3,updatedAt:Date.now()}});
  await expect(page.locator('#public-track-content')).toContainText('Em atendimento');
  await db.ref('publicTracking/'+token).remove();
  await expect(page.locator('#public-track-content')).toContainText(/encerrado|indisponível/);
});
test('cotação contratada mantém valor e motoboy no serviço de duas viagens',async({browser})=>{
  const sc=await browser.newContext({viewport:{width:393,height:852}}),cc=await browser.newContext({viewport:{width:393,height:852}});
  const store=await sc.newPage(),courier=await cc.newPage();
  store.on('dialog',d=>d.accept());courier.on('dialog',d=>d.dismiss());
  await register(store,'store','quote-store-'+Date.now()+'@example.test');
  await store.evaluate(()=>window.__express.setView('profile'));
  await store.locator('#prof-address').fill('Rua da Loja, 10');
  await store.locator('#store-profile-form button[type=submit]').click();
  await expect(store.locator('#prof-address')).toHaveCount(0);
  await register(courier,'courier','quote-courier-'+Date.now()+'@example.test');
  await courier.locator('[data-toggle-availability]').click();
  await expect(courier.locator('[data-toggle-availability]')).toHaveText('PAUSAR');
  await store.locator('[data-open-sheet][data-sheet-mode=quote]').first().click();
  await store.locator('#service-type-select').selectOption('roundtrip');
  await store.locator('#quote-city').fill('Aracruz');
  await store.locator('#input-neighborhood').fill('Centro');
  await store.locator('#btn-submit-order').click();
  await expect(store.locator('#order-sheet-overlay')).not.toHaveClass(/active/);
  await courier.locator('[data-nav=quotes]').click();
  await courier.locator('[id^=bid-input-]').fill('25');
  await courier.locator('[data-action=send-bid]').click();
  await expect(store.locator('[data-action=accept-bid]')).toHaveCount(1);
  await store.locator('[data-action=accept-bid]').click();
  await expect(store.locator('#order-sheet-overlay')).toHaveClass(/active/);
  await expect(store.locator('#quote-price-mobile')).toHaveText('R$ 25,00');
  await store.locator('#inp-client').fill('Cliente da Cotação');
  await store.locator('#inp-street').fill('Rua Cliente');
  await store.locator('#inp-number').fill('20');
  await store.locator('#btn-submit-order').click();
  await expect(store.locator('#order-sheet-overlay')).not.toHaveClass(/active/);
  await courier.locator('[data-nav=available]').click();
  await courier.locator('[data-action=accept]').click();
  for(const step of [1,2,3]) {
    await expect(courier.locator('[data-action=roundtrip-step]')).toHaveAttribute('data-step',String(step));
    await courier.locator('[data-action=roundtrip-step]').click();
  }
  await courier.locator('[data-action=finish]').click();
  await expect(courier.locator('#content')).toContainText('Entregue');
  await expect(courier.locator('.fee')).toHaveText('R$ 25,00');
  await courier.screenshot({path:'/tmp/express-v2-courier.png',fullPage:true});
  await sc.close();await cc.close();
});
test('cadastro interrompido pode ser retomado com o mesmo e-mail sem perder a conta',async({page})=>{
  await page.goto(base);
  await page.locator('#tab-register').click();
  await page.locator('#auth-name').fill('Conta Recuperada');
  await page.locator('#auth-extra').fill('27999999999');
  await page.locator('#auth-email').fill('recover-'+Date.now()+'@example.test');
  await page.locator('#auth-password').fill('test-password-123');
  await page.route('**/southamerica-east1/orderCommand',route=>route.fulfill({status:503,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({error:{status:'UNAVAILABLE',message:'Teste de indisponibilidade'}})}));
  await page.locator('#auth-submit-btn').click();
  await expect(page.locator('#auth-feedback')).toContainText('Teste de indisponibilidade');
  await expect(page.locator('#auth-submit-btn')).toBeEnabled();
  await page.unroute('**/southamerica-east1/orderCommand');
  await page.locator('#auth-submit-btn').click();
  await expect(page.locator('#login-screen')).toBeHidden({timeout:15000});
  await page.locator('#avatar').click();
  await expect(page.locator('#prof-name')).toHaveValue('CONTA RECUPERADA');
});

test('duas corridas organizadas, prioridade trocada e terceira bloqueada; lojista copia link público',async({browser})=>{
  await db.ref().set(null);
  const sc=await browser.newContext({viewport:{width:393,height:852},permissions:['clipboard-read','clipboard-write']});
  const cc=await browser.newContext({viewport:{width:393,height:852}});
  const store=await sc.newPage(), courier=await cc.newPage();
  courier.on('dialog',d=>d.dismiss());
  await register(store,'store','two-store-'+Date.now()+'@example.test');
  await store.evaluate(()=>window.__express.setView('profile'));
  await store.locator('#prof-address').fill('Rua da Loja, 10');
  await store.locator('#store-profile-form button[type=submit]').click();
  await expect(store.locator('#prof-address')).toHaveCount(0);
  await register(courier,'courier','two-courier-'+Date.now()+'@example.test');
  await courier.locator('[data-toggle-availability]').click();
  await expect(courier.locator('[data-toggle-availability]')).toHaveText('PAUSAR');
  for(let i=1;i<=3;i++){
    await store.evaluate(()=>window.__express.setView('dashboard'));
    await store.locator('[data-open-sheet][data-sheet-mode=delivery]').first().click();
    await store.locator('#inp-client').fill('Cliente '+i);
    await store.locator('#inp-street').fill('Rua Teste '+i);
    await store.locator('#inp-number').fill(String(i));
    await store.locator('#input-neighborhood').fill('Centro');
    await store.locator('#quote-city').fill('Aracruz');
    await store.locator('#btn-submit-order').click();
    await expect(store.locator('#order-sheet-overlay')).not.toHaveClass(/active/);
  }
  await expect(courier.locator('[data-action=accept]')).toHaveCount(3);
  await courier.locator('[data-action=accept]').first().click();
  await expect(courier.locator('#content')).toContainText('1 · EM ATENDIMENTO');
  await courier.locator('[data-nav=available]').click();
  await courier.locator('[data-action=accept]').first().click();
  await expect(courier.locator('#content')).toContainText('2 · PRÓXIMA ENTREGA');
  await expect(courier.locator('#content')).toContainText('2/2 VAGAS OCUPADAS');
  const next=courier.locator('[data-action=focus]');
  const nextId=await next.getAttribute('data-id');
  await next.click();
  await expect(courier.locator('[data-order-id]').first()).toHaveAttribute('data-order-id',nextId);
  await courier.reload();
  await courier.locator('[data-nav=run]').click();
  await expect(courier.locator('[data-order-id]').first()).toHaveAttribute('data-order-id',nextId);
  await courier.locator('[data-nav=available]').click();
  await expect(courier.locator('[data-action=accept]')).toHaveCount(0);
  await expect(courier.locator('#content')).toContainText('2/2 vagas ocupadas');
  await store.locator('[data-action=copy-tracking]').first().click();
  await expect(store.locator('#toasts')).toContainText('Link copiado');
  const link=await store.evaluate(()=>navigator.clipboard.readText());
  expect(link).toMatch(/^https:\/\/express-v2-rastreio-fmrpbr\.web\.app\/rastreio\/#track=[a-f0-9]{64}$/);
  await courier.locator('[data-nav=run]').click();
  await courier.screenshot({path:'/tmp/express-v2-capacity.png',fullPage:true});
  await sc.close();await cc.close();
});
test('página pública dedicada recebe posição da fila e GPS, expira e não pede login',async({page})=>{
  const token='c'.repeat(64),root='publicTracking/'+token;
  await db.ref(root).set({orderCode:'EXP-LIVE',status:'run',queuePosition:2,expiresAt:Date.now()+600000,revoked:false,location:{lat:-19.8,lng:-40.3,updatedAt:Date.now()}});
  await page.goto('http://127.0.0.1:8080/rastreio/#track='+token);
  await expect(page.locator('#status')).toHaveText('Você é a próxima entrega');
  await expect(page.locator('#map')).toHaveAttribute('href',/query=-19.8,-40.3/);
  await db.ref(root).update({queuePosition:1});
  await expect(page.locator('#status')).toHaveText('Sua entrega está em atendimento');
  await page.screenshot({path:'/tmp/express-tracking.png',fullPage:true});
  await db.ref(root).remove();
  await expect(page.locator('#status')).toContainText('encerrado');
  await expect(page.locator('#map')).toBeHidden();
  await expect(page.locator('#code')).toHaveText('');
});
test('admin agenda tabela, perfis recebem aviso, preços antigos permanecem e chuva exige decisão',async({browser})=>{
  await db.ref().set(null);
  const contexts=await Promise.all([1,2,3].map(()=>browser.newContext({viewport:{width:393,height:852}})));
  const [ad,store,courier]=await Promise.all(contexts.map(c=>c.newPage()));
  const email='admin-'+Date.now()+'@example.test';
  const user=await app.auth().createUser({email,password:'test-password-123'});
  await app.auth().setCustomUserClaims(user.uid,{admin:true});
  await register(store,'store','tariff-store-'+Date.now()+'@example.test');
  await store.evaluate(()=>window.__express.setView('profile'));
  await store.locator('#prof-address').fill('RUA DA LOJA, 1');
  await store.locator('#store-profile-form button[type=submit]').click();
  await expect(store.locator('#prof-address')).toHaveCount(0);
  await register(courier,'courier','tariff-courier-'+Date.now()+'@example.test');
  await ad.goto(base);await ad.locator('#auth-email').fill(email);await ad.locator('#auth-password').fill('test-password-123');await ad.locator('[data-admin-login]').click();
  await expect(ad.locator('#login-screen')).toBeHidden();
  await ad.evaluate(()=>window.__express.setView('rates'));
  await expect(ad.locator('#tariff-form [data-rate=sedeDay]')).toHaveValue('5');
  await expect(ad.locator('#tariff-form [data-zone]')).toHaveCount(23);
  await ad.locator('#tariff-form [data-rate=sedeDay]').fill('6');
  await courier.locator('[data-action=signal-rain]').click();
  await courier.locator('[data-decision=confirm]').click();
  await expect(ad.locator('#content')).toContainText('1 motoboy(s)');
  await expect(ad.locator('#tariff-form [data-rate=sedeDay]')).toHaveValue('6');
  await ad.locator('#tariff-form [data-rate=sedeDay]').fill('5');
  ad.on('dialog',d=>d.accept());
  await ad.locator('#tariff-form button[type=submit]').click();
  await expect(store.locator('#content')).toContainText('Novos valores de entrega agendados');
  await expect(courier.locator('#content')).toContainText('Novos valores de entrega agendados');
  const plans=(await db.ref('config/tariffPlans').get()).val();const planId=Object.keys(plans)[0];
  await expect(ad.locator('[data-action=cancel-rates]')).toHaveCount(1);
  await store.locator('[data-nav=tariffs]').click();
  await expect(store.locator('#content')).toContainText('Ver todos os valores desta versão');
  await expect(store.locator('#tariff-form')).toHaveCount(0);
  await ad.locator('#rain-form button[type=submit]').click();
  await expect(courier.locator('#content')).toContainText('Mudança de chuva agendada');
  await ad.locator('[data-action=cancel-rates]').click();
  await expect(store.locator('#content')).toContainText('Alteração de tarifas cancelada');
  expect((await db.ref('config/tariffPlans/'+planId).get()).exists()).toBe(true);
  for(const page of [ad,store,courier])expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const c of contexts)await c.close();
});

test('painel admin filtra, pagina, acompanha pagamentos e preserva detalhes sem permitir baixas',async({browser})=>{
  await db.ref().set(null);
  const now=Date.now(),email='ops-admin-'+now+'@example.test';
  const user=await app.auth().createUser({email,password:'test-password-123'});
  await app.auth().setCustomUserClaims(user.uid,{admin:true});
  const baseOrder={storeId:'shopA',storeName:'LOJA A',courierId:'riderA',courierName:'MOTO A',serviceType:'delivery',fee:5,created:now,revision:1};
  const orders={
    runLate:{...baseOrder,orderCode:'EXP-ATRASO',status:'run',created:now-1800000,accepted:now-1560000,client:'<img src=x onerror="window.__leaked=true">',location:{lat:-19.8,lng:-40.2,updatedAt:now-300000}},
    pending:{...baseOrder,orderCode:'EXP-PENDENTE',status:'done',created:now-86400000,completed:now-86400000},
    reported:{...baseOrder,storeId:'shopB',storeName:'LOJA B',courierId:'riderB',orderCode:'EXP-INFORMADO',status:'done',fee:7,created:now-86400000,completed:now-86400000,paymentStatus:'reported'},
    paid:{...baseOrder,orderCode:'EXP-PAGO',status:'done',fee:9,completed:now,paid:true},
    cancelled:{...baseOrder,orderCode:'EXP-CANCELADO',status:'cancelled',fee:0},
    reserve:{...baseOrder,courierId:'riderB',courierName:'MOTO B',orderCode:'COT-RESERVA',status:'cotacao_aceita'}
  };
  for(let i=0;i<21;i++)orders['open'+i]={...baseOrder,courierId:i===0?'riderA':null,courierName:i===0?'MOTO A':null,...(i===0?{assignedCourierId:'riderA'}:{}),orderCode:'EXP-ABERTO-'+i,status:'open',created:now-i};
  await db.ref().set({orders,profiles:{stores:{shopA:{name:'LOJA A'},shopB:{name:'LOJA B'}},couriers:{riderA:{name:'MOTO A'},riderB:{name:'MOTO B'},riderC:{name:'MOTO C'},riderD:{name:'MOTO D'}}},courierPresence:{riderA:{availableForWork:true},riderB:{availableForWork:true},riderC:{availableForWork:false},riderD:{availableForWork:false}},courierConnections:{riderA:{s:{lastSeen:now}},riderB:{s:{lastSeen:now-100000}},riderD:{s:{lastSeen:now}}}});
  const context=await browser.newContext({viewport:{width:393,height:852}}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#auth-email').fill(email);await page.locator('#auth-password').fill('test-password-123');await page.locator('[data-admin-login]').click();
  await expect(page.locator('[data-admin-stat=orders-total] .stat-value')).toHaveText('27');
  await expect(page.locator('[data-admin-stat=orders-open] .stat-value')).toHaveText('21');
  await expect(page.locator('[data-admin-stat=finance-reported] .stat-value')).toContainText('7,00');
  await expect(page.locator('[data-admin-stat=team-online] .stat-value')).toHaveText('2');
  await expect(page.locator('[data-admin-stat=team-one] .stat-value')).toHaveText('1');
  await expect(page.locator('[data-admin-stat=team-two] .stat-value')).toHaveText('1');
  await expect(page.locator('[data-admin-order]')).toHaveCount(20);
  await page.locator('[data-action=admin-page][data-id=next]').click();
  await expect(page.locator('[data-admin-order]')).toHaveCount(7);
  await page.locator('[data-action=admin-detail][data-id=runLate]').first().click();
  await expect(page.locator('#admin-order-detail')).toContainText('<img src=x');
  await expect(page.locator('#admin-order-detail img')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__leaked)).toBeUndefined();
  await expect(page.locator('#admin-order-detail [data-action=report-payment],#admin-order-detail [data-action=confirm-payment],#admin-order-detail [data-action=cancel]')).toHaveCount(0);
  await db.ref('orders/runLate').update({picked:now,location:{lat:-19.8,lng:-40.2,updatedAt:now},revision:2});
  await expect(page.locator('#admin-order-detail')).toContainText('Retirada registrada');
  await expect(page.locator('#content')).not.toContainText('Retirada não registrada há 25 minutos ou mais');
  await page.locator('#admin-store').selectOption('shopB');await page.locator('#admin-payment').selectOption('reported');
  await page.locator('#admin-filter-form button[type=submit]').click();
  await expect(page.locator('[data-admin-order]')).toHaveCount(1);
  await expect(page.locator('[data-admin-order]')).toContainText('EXP-INFORMADO');
  await db.ref('orders/reported').update({paid:true,paymentStatus:'confirmed',paymentConfirmedAt:now,revision:2});
  await expect(page.locator('[data-admin-order]')).toHaveCount(0);
  await expect(page.locator('#admin-payment')).toHaveValue('reported');
  await page.locator('#admin-search').fill('RASCUNHO');
  await db.ref('courierConnections/riderD/s').set({lastSeen:Date.now()});
  await expect(page.locator('#admin-search')).toHaveValue('RASCUNHO');
  await page.locator('[data-action=admin-reset]').click();
  await expect(page.locator('[data-admin-stat=finance-reported] .stat-value')).toContainText('0,00');
  await expect(page.locator('[data-admin-stat=finance-confirmed] .stat-value')).toContainText('16,00');
  expect((await db.ref('orders/runLate/fee').get()).val()).toBe(5);
  expect((await db.ref('orders/reported/paymentConfirmedBy').get()).val()).toBeNull();
  expect(errors).toEqual([]);
  for(const width of [320,393,480]){await page.setViewportSize({width,height:852});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await context.close();
});

async function completePasswordReset(email,password,apiKey){
  const list=await (await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-express-entregas-browser/oobCodes')).json();
  const code=list.oobCodes.filter(c=>c.email===email&&c.requestType==='PASSWORD_RESET').at(-1);
  expect(Boolean(code?.oobCode)).toBe(true);
  // Simula apenas o formulário seguro do provedor, usando código do emulador.
  // Nenhum link ou código real é solicitado, impresso ou armazenado pelo app.
  const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key='+encodeURIComponent(apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({oobCode:code.oobCode,newPassword:password})});
  expect(response.status).toBe(200);
}

test('admin sem senha abre primeiro acesso, solicita link e entra após definir senha pelo provedor',async({page})=>{
  const email='first-admin-'+Date.now()+'@example.test',password='nova-senha-admin-123';
  const user=await app.auth().createUser({email});await app.auth().setCustomUserClaims(user.uid,{admin:true});
  await page.goto(base);await page.locator('[data-admin-login]').click();
  await expect(page.locator('#admin-login-panel')).toBeVisible();
  await expect(page.locator('#auth-feedback')).toContainText('primeira senha');
  await expect(page.locator('#tab-register')).toBeHidden();
  await page.locator('[data-action=open-first-password]').click();
  await expect(page.locator('#recovery-title')).toHaveText('Definir primeira senha');
  await expect(page.locator('#auth-password')).toBeHidden();
  await page.locator('#recovery-email').fill(email);
  await page.locator('#recovery-submit').click();
  await expect(page.locator('#recovery-feedback')).toHaveAttribute('data-state','success');
  await expect(page.locator('#recovery-feedback')).toContainText('spam');
  await completePasswordReset(email,password,await page.evaluate(()=>window.EXPRESS_FIREBASE_CONFIG.apiKey));
  await page.locator('[data-action=recovery-back]').click();
  await expect(page.locator('#auth-email')).toHaveValue(email);
  await expect(page.locator('#admin-login-panel')).toBeVisible();
  await page.locator('#auth-password').fill(password);await page.locator('#auth-submit-btn').click();
  await expect(page.locator('#login-screen')).toBeHidden();
  await expect(page.locator('[data-admin-sync]')).toContainText('Conectado');
  expect((await app.auth().getUser(user.uid)).customClaims.admin).toBe(true);
  expect((await db.ref('profiles/stores/'+user.uid).get()).exists()).toBe(false);
});

test('recuperação troca a senha existente e não concede admin a uma loja',async({page})=>{
  const email='reset-store-'+Date.now()+'@example.test',oldPassword='senha-anterior-123',newPassword='senha-recuperada-456';
  const user=await app.auth().createUser({email,password:oldPassword});
  await db.ref('profiles/stores/'+user.uid).set({name:'LOJA RECUPERADA',address:'RUA DA LOJA',phone:'27999999999'});
  await page.goto(base);await page.locator('#tab-register').click();await page.locator('#auth-email').fill(email);
  await page.locator('[data-action=open-password-recovery]').click();
  await expect(page.locator('#recovery-email')).toHaveValue(email);
  await page.locator('#recovery-submit').click();
  await expect(page.locator('#recovery-feedback')).toHaveAttribute('data-state','success');
  const key=await page.evaluate(()=>window.EXPRESS_FIREBASE_CONFIG.apiKey);
  await completePasswordReset(email,newPassword,key);
  const old=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:oldPassword,returnSecureToken:true})});
  expect(old.status).toBe(400);
  await page.locator('[data-action=recovery-back]').click();await page.locator('#auth-password').fill(newPassword);
  await expect(page.locator('#tab-login')).toHaveClass(/active/);
  await expect(page.locator('#field-extra')).toBeHidden();
  await page.locator('[data-admin-login]').click();
  await expect(page.locator('#auth-feedback')).toContainText('não possui permissão de administrador');
  expect((await app.auth().getUser(user.uid)).customClaims?.admin).not.toBe(true);
  await page.locator('[data-action=back-to-profiles]').click();
  await page.locator('#auth-submit-btn').click();
  await expect(page.locator('#login-screen')).toBeHidden();
  await expect(page.locator('#role')).toHaveValue('store');
});

test('recuperação mostra erro de rede na própria tela e permanece acessível em celular pequeno',async({page})=>{
  await page.route('**/accounts:sendOobCode**',route=>route.abort());
  for(const width of [320,393,480]){
    await page.setViewportSize({width,height:568});await page.goto(base);
    await page.locator('[data-admin-login]').click();
    await page.locator('[data-action=open-password-recovery]').click();
    await page.locator('#recovery-email').fill('network-test@example.test');
    await page.locator('#recovery-submit').click();
    await expect(page.locator('#recovery-feedback')).toHaveAttribute('data-state','error');
    await expect(page.locator('#recovery-feedback')).toContainText('conexão');
    await expect(page.locator('#recovery-submit')).toBeEnabled();
    await page.locator('[data-action=recovery-back]').click();
    await expect(page.locator('#admin-login-panel')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test('rastreio mantém consulta segura por HTTPS quando WebSocket não está disponível',async({page})=>{
  const token='d'.repeat(64),root='publicTracking/'+token;
  await db.ref(root).set({orderCode:'EXP-FALLBACK',status:'open',expiresAt:Date.now()+600000,revoked:false});
  await page.addInitScript(()=>{window.WebSocket=undefined;});
  await page.goto('http://127.0.0.1:8080/rastreio/#track='+token);
  await expect(page.locator('#status')).toHaveText('Aguardando motoboy');
  await expect(page.locator('#connection')).toContainText('10 s');
  await db.ref(root).remove();
  await expect(page.locator('#status')).toContainText('encerrado',{timeout:15000});
});


test('notificações da loja mostram ausência de dispositivo sem afirmar entrega',async({page})=>{
  await register(page,'store','push-status-'+Date.now()+'@example.test');
  await page.locator('[data-action=push-settings]').click();
  await expect(page.getByRole('dialog',{name:'Notificações e som'})).toBeVisible();
  await page.locator('[data-push-test]').click();
  await expect(page.locator('dialog [data-feedback]')).toContainText('Nenhum dispositivo cadastrado');
  await expect(page.locator('[data-push-test]')).toBeEnabled();
  await page.locator('dialog [data-close]').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('diagnóstico nativo revela canal silencioso e volume zero, e teste local usa a categoria escolhida',async({page})=>{
 await register(page,'store','native-diagnostic-'+Date.now()+'@example.test');
 await page.evaluate(()=>{
  window.__qaLocalNotifications=[];window.__qaSoundSettings=[];
  window.Capacitor.isNativePlatform=()=>true;
  window.ExpressNativePush.PushNotifications={checkPermissions:async()=>({receive:'granted'})};
  window.ExpressNativePush.NotificationSettings={prepare:async()=>{},status:async()=>({permission:true,volume:0,ringerMode:0,doNotDisturb:true,batteryOptimized:true,channels:[{id:'express_orders_sound_v1',name:'Novos pedidos',exists:true,importance:2,sound:false}]}),settings:async value=>window.__qaSoundSettings.push(value)};
  window.ExpressNativePush.LocalNotifications={checkPermissions:async()=>({display:'granted'}),schedule:async value=>window.__qaLocalNotifications.push(value)};
 });
 await page.locator('[data-action=push-settings]').click();
 await expect(page.locator('[data-android-diagnostics]')).toContainText('Volume de notificações zerado');
 await expect(page.locator('[data-android-diagnostics]')).toContainText('Não perturbe está ativado');
 await expect(page.locator('[data-android-diagnostics]')).toContainText('silenciosa ou bloqueada');
 await page.locator('#push-category').selectOption('order');
 await page.locator('[data-local-test]').click();
 await expect(page.locator('dialog [data-feedback]')).toContainText('Aviso local solicitado');
 expect(await page.evaluate(()=>window.__qaLocalNotifications[0].notifications[0].channelId)).toBe('express_orders_sound_v1');
 await page.locator('[data-sound-settings]').click();
 expect(await page.evaluate(()=>window.__qaSoundSettings[0].channel)).toBe('express_orders_sound_v1');
 await page.locator('[data-close]').click();
});
