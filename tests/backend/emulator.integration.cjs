const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('../../functions/node_modules/firebase-admin');
const { createCommandHandler } = require('../../functions/commands');
const { createDispatcher } = require('../../functions/notifications');
const now = Date.parse('2026-11-16T15:00:00Z');
const auth = uid => ({ uid, token: { email: uid+'@example.test' } });
let app, db, execute, seq = 0;
const request = (action, orderId, input = {}, requestId = 'integration_'+(++seq)) => ({ action, ...(orderId ? { orderId } : {}), input, requestId });
const fields = { serviceType:'delivery', serviceDate:'2026-11-16', city:'ARACRUZ', clientNeighborhood:'CENTRO', client:'CLIENTE', phone:'27999999999', clientStreet:'RUA PRIVADA', clientNumber:'1', paymentMethod:'money', selectedZone:'' };
before(() => {
  assert.ok(process.env.FIREBASE_DATABASE_EMULATOR_HOST, 'Integração exige emulador');
  app = admin.initializeApp({ projectId:'demo-express-entregas-integration', databaseURL:'https://demo-express-entregas-integration.firebaseio.com' }, 'integration');
  db = app.database(); execute = createCommandHandler(db, () => now);
});
after(async () => { await app.delete(); });
beforeEach(async () => {
  await db.ref().set({ profiles: { stores: { storeA:{ name:'LOJA A', address:'RUA DA LOJA' } }, couriers: { courierA:{ name:'MOTO A' }, courierB:{ name:'MOTO B' } } }, courierPresence: { courierA:{ registered:true, availableForWork:true, busy:false }, courierB:{ registered:true, availableForWork:true, busy:false } } });
}, { timeout: 15000 });
async function create() { return (await execute(auth('storeA'), request('saveOrder', null, fields))).orderId; }

test('tarifas: revisão evita perda entre dois admins, avisos chegam aos dois perfis e ativação é idempotente', {timeout:30000},async()=>{
 const T=require('../../functions/tariffs');const defaults=require('../../functions/default-rates.json');
 const rates={zones:defaults.zones,sedeDay:5,sedeNight:7,rainSede:2,night:3,bag:10,bankService:10,cardMinimum:10,lateMinimum:10};
 const a={uid:'admin',token:{admin:true}};
 const result=await Promise.allSettled([1,2].map(()=>execute(a,request('scheduleRates',null,{rates,effectiveAt:now+60000,baseVersion:'legacy'}))));
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 const root=(await db.ref().get()).val();
 assert.equal(Object.keys(root.config.tariffPlans).length,1);
 assert.equal(Object.keys(root.systemNotices).length,1);
 await db.ref('fcmTokens').set({storeA:{d:{token:'store-token'}},courierA:{d:{token:'courier-token'}}});
 const messages=[];const dispatch=require('../../functions/notifications').createUpdateDispatcher(db,{send:async p=>messages.push(p)},()=>now);
 await dispatch(Object.keys(root.pushUpdates)[0]);
 assert.equal(messages.length,2);assert.ok(messages.every(p=>p.data.type==='announcement'&&!('orderId' in p.data)));
 const activate=()=>require('../../functions/tariff-scheduler').activateTariffs(db,now+60000);
 await Promise.all([activate(),activate()]);
 assert.equal(Object.keys((await db.ref('systemNotices').get()).val()).length,2);
});

test('transações reais: dois motoboys disputam uma corrida, exatamente um assume', { timeout:30000 }, async () => {
  const id = await create();
  const outcomes = await Promise.allSettled(['courierA','courierB'].map(uid => execute(auth(uid), request('accept', id))));
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  const root = (await db.ref().get()).val();
  const owner = root.orders[id].courierId;
  assert.equal(root.courierOrders[owner][id].status, 'run');
  assert.equal(root.storeOrders.storeA[id].courierId, owner);
  assert.ok(!root.availableOrders?.[id]); assert.ok(!root.pushJobs?.[id]);
});
test('transações reais: três aceites simultâneos do mesmo motoboy ocupam no máximo duas vagas', { timeout:30000 }, async () => {
  const a = await create(), b = await create(), c = await create();
  const outcomes = await Promise.allSettled([a,b,c].map(id => execute(auth('courierA'), request('accept', id))));
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 2);
  const orders = (await db.ref('orders').get()).val();
  assert.equal(Object.values(orders).filter(o => o.status === 'run').length, 2);
  assert.deepEqual(Object.values(orders).filter(o=>o.status==='run').map(o=>o.queuePosition).sort(),[1,2]);
});
test('push: uma corrida permite oferta adicional; duas vagas ocupadas bloqueiam novas ofertas', {timeout:30000}, async()=>{
  const a=await create(),b=await create(),c=await create();
  await execute(auth('courierA'),request('accept',a));
  await db.ref('fcmTokens/courierA').set({device:{token:'tokenA'}});
  const sends=[];
  const dispatch=createDispatcher(db,{send:async p=>sends.push(p)},()=>now);
  await dispatch(b);
  assert.equal(sends.length,1);
  await execute(auth('courierA'),request('accept',b));
  await dispatch(c);
  assert.equal(sends.length,1);
});
test('transações reais: repetição simultânea retorna mesmo pedido e um evento', { timeout:30000 }, async () => {
  const call = request('saveOrder', null, fields);
  const results = await Promise.all([execute(auth('storeA'),call),execute(auth('storeA'),call)]);
  assert.equal(results[0].orderId, results[1].orderId);
  assert.equal(Object.keys((await db.ref('orders').get()).val()).length, 1);
  assert.equal(Object.keys((await db.ref('orderEvents/'+results[0].orderId).get()).val()).length, 1);
});
test('push: imediato deduplicado, lembrete após cinco minutos e interrupção após aceite', { timeout:30000 }, async () => {
  const id = await create();
  await db.ref('fcmTokens/courierA').set({ device1:{token:'tokenA'}, device2:{token:'tokenA'} });
  await db.ref('fcmTokens/courierB').set({ device:{token:'tokenB'} });
  let clock = now, sends = [];
  const dispatch = createDispatcher(db, { send: async payload => { sends.push(payload); } }, () => clock);
  await Promise.all([dispatch(id), dispatch(id)]);
  assert.equal(sends.length, 2);
  assert.equal(sends[0].android.notification.channelId, 'express_orders_v2');
  await dispatch(id); assert.equal(sends.length, 2);
  clock += 299999; await dispatch(id); assert.equal(sends.length, 2);
  clock += 1; await dispatch(id); assert.equal(sends.length, 4);
  assert.equal(sends[2].android.notification.channelId, 'express_reminders_v2');
  await execute(auth('courierA'),request('accept',id));
  clock += 300000; await dispatch(id); assert.equal(sends.length, 4);
  assert.ok(!(await db.ref('pushJobs/'+id).get()).exists());
});
test('push: OFF, preferências e token inválido são respeitados', { timeout:30000 }, async () => {
  const id = await create();
  await db.ref('courierPresence/courierB/availableForWork').set(false);
  await db.ref('fcmTokens').set({ courierA:{ device:{token:'invalid'} }, courierB:{device:{token:'off'}} });
  let calls = 0, clock = now;
  const dispatch = createDispatcher(db,{ send: async () => { calls++; const error = new Error(); error.code='messaging/registration-token-not-registered'; throw error; } }, () => clock);
  await dispatch(id); assert.equal(calls, 1);
  assert.equal((await db.ref('fcmTokens/courierA/device').get()).exists(), false);
  await db.ref('fcmTokens/courierA/device').set({token:'new'});
  await db.ref('pushPreferences/courierA').set({reminders:false});
  clock += 300000; await dispatch(id); assert.equal(calls, 1);
});
test('push: aceite durante preparação impede os próximos envios e não ressuscita job', { timeout:30000 }, async () => {
  const id = await create();
  await db.ref('fcmTokens').set({courierA:{d:{token:'a'}},courierB:{d:{token:'b'}}});
  let sends = 0;
  const dispatch = createDispatcher(db,{send: async () => { sends++; if(sends === 1) await execute(auth('courierA'),request('accept',id)); }},()=>now);
  await dispatch(id); assert.equal(sends,1);
  assert.ok(!(await db.ref('pushJobs/'+id).get()).exists());
});
test('primeiro cadastro funciona em banco vazio e não permite segundo papel', { timeout:30000 }, async () => {
  await db.ref().set(null);
  await execute(auth('newUser'),request('createProfile',null,{role:'courier',name:'MOTO',phone:'27999999999'}));
  assert.equal((await db.ref('profiles/couriers/newUser/name').get()).val(),'MOTO');
  await assert.rejects(()=>execute(auth('newUser'),request('createProfile',null,{role:'store',name:'LOJA',phone:'27999999999'})),/já possui/);
});
test('atualização de pagamento chega com OFF e preferência de ofertas desativada, sem duplicidade', { timeout:30000 }, async () => {
  const { createUpdateDispatcher } = require('../../functions/notifications');
  const id = await create();
  await execute(auth('courierA'),request('accept',id));
  await db.ref('courierPresence/courierA/availableForWork').set(false);
  await db.ref('pushPreferences/courierA').set({enabled:false,orders:false,quotes:false,reminders:false});
  await db.ref('fcmTokens/courierA').set({a:{token:'device'},b:{token:'device'}});
  await db.ref('pushUpdates/manual').set({orderId:id,action:'report-payment',recipients:['courierA'],createdAt:now});
  let sends=0;
  const dispatch = createUpdateDispatcher(db,{send:async message=>{sends++;assert.equal(message.android.notification.channelId,'express_updates_v2');assert.equal(message.notification.title,'Pagamento informado');assert.ok(!JSON.stringify(message).includes('paymentPix'));}},()=>now);
  await Promise.all([dispatch('manual'),dispatch('manual')]);
  assert.equal(sends,1);
});

test('financeiro: loja não quita, confirmação concorrente é única e Pix fica privado', { timeout:30000 }, async () => {
  const id = await create();
  await execute(auth('courierA'),request('savePix',null,{type:'email',key:'pix@example.com',holder:'MOTO A'}));
  await execute(auth('courierA'),request('accept',id));
  await execute(auth('courierA'),request('picked',id));
  await execute(auth('courierA'),request('finish',id));
  await assert.rejects(()=>execute(auth('courierA'),request('confirm-payment',id)),/lojista/);
  await Promise.all([1,2].map(()=>execute(auth('storeA'),request('report-payment',id))));
  let order = (await db.ref('orders/'+id).get()).val();
  assert.equal(order.paid,false);
  assert.equal(order.paymentStatus,'reported');
  await Promise.all([1,2].map(()=>execute(auth('courierA'),request('confirm-payment',id))));
  order = (await db.ref('orders/'+id).get()).val();
  assert.equal(order.paid,true);
  assert.equal(order.paymentConfirmedBy,'courierA');
  for (const path of ['storeOrders/storeA/'+id,'courierOrders/courierA/'+id]) assert.equal((await db.ref(path+'/paymentPix/key').get()).val(),'pix@example.com');
  const events = Object.values((await db.ref('orderEvents/'+id).get()).val());
  assert.equal(events.filter(e=>e.action==='report-payment').length,1);
  assert.equal(events.filter(e=>e.action==='confirm-payment').length,1);
  for (const path of ['availableOrders','quoteBoard','publicTracking']) assert.ok(!JSON.stringify((await db.ref(path).get()).val()).includes('pix@example.com'));
});

test('notification test: native and web use production dispatcher, one submission per device and no order data', {timeout:30000},async()=>{
  await db.ref('fcmTokens/storeA/native').set({token:'native-token'});
  await db.ref('pushSubscriptions/storeA/web').set({endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'test',auth:'test'}});
  const tools=require('../../functions/notification-tools').createNotificationTools(db,()=>({vapidPublicKey:'public'}),()=>now);
  const results=await Promise.allSettled([tools(auth('storeA'),{action:'test'}),tools(auth('storeA'),{action:'test'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const events=(await db.ref('pushUpdates').get()).val();assert.equal(Object.keys(events).length,1);
  const native=[],web=[];
  const dispatch=require('../../functions/notifications').createUpdateDispatcher(db,{send:async message=>native.push(message)},()=>now,{sendNotification:async(device,payload)=>web.push(JSON.parse(payload))});
  const id=Object.keys(events)[0];await Promise.all([dispatch(id),dispatch(id)]);
  assert.equal(native.length,1);assert.equal(web.length,1);
  assert.equal(native[0].data.type,'test');assert.equal(native[0].android.notification.channelId,'express_updates_v2');
  assert.equal(web[0].type,'test');assert.ok(!JSON.stringify([...native,...web]).includes('orderId'));
});

test('audible channels and per-device tests route only to the selected device; service status never means audible receipt',{timeout:30000},async()=>{
 await db.ref('fcmTokens/storeA').set({one:{token:'native-one',notificationSchema:'sound-v1'},two:{token:'native-two'}});
 const tools=require('../../functions/notification-tools').createNotificationTools(db,()=>({vapidPublicKey:'public'}),()=>now);
 const result=await tools(auth('storeA'),{action:'test',target:{platform:'android',id:'one'},category:'order'});
 const messages=[];const dispatch=require('../../functions/notifications').createUpdateDispatcher(db,{send:async p=>messages.push(p)},()=>now);
 await dispatch(result.eventId);
 assert.equal(messages.length,1);assert.equal(messages[0].token,'native-one');
 assert.equal(messages[0].android.notification.channelId,'express_orders_sound_v1');assert.equal(messages[0].android.notification.sound,'express_alert');
 const status=await tools(auth('storeA'),{action:'status',eventId:result.eventId});
 assert.equal(status.devices[0].status,'sent');assert.ok(!JSON.stringify(status).includes('native-one'));
});

test('operational alerts create one private push event and expire; pausing offers does not stop them',{timeout:30000},async()=>{
 const create=require('../../functions/alert-notifications').createAlertNotification(db,()=>now);
 await db.ref('alerts/notice').set({senderId:'storeA',createdAt:now,expiresAt:now+7200000,message:'PRIVATE FREE TEXT'});
 await Promise.all([create('notice'),create('notice')]);
 const events=(await db.ref('pushUpdates').get()).val();assert.equal(Object.keys(events).length,1);
 await db.ref('fcmTokens/courierA/d').set({token:'native',notificationSchema:'sound-v1'});
 await db.ref('courierPresence/courierA/availableForWork').set(false);
 const messages=[];await require('../../functions/notifications').createUpdateDispatcher(db,{send:async p=>messages.push(p)},()=>now)('alert_notice');
 assert.equal(messages.length,1);assert.equal(messages[0].android.notification.channelId,'express_alerts_sound_v1');assert.equal(messages[0].data.type,'alert');
 assert.ok(!JSON.stringify(messages).includes('PRIVATE FREE TEXT'));
 await db.ref('alerts/expired').set({senderId:'storeA',createdAt:now,expiresAt:now-1});await create('expired');assert.equal(Object.keys((await db.ref('pushUpdates').get()).val()).length,1);
});

test('transient update failure retries at most three attempts; successful devices are never resent',{timeout:30000},async()=>{
 let clock=now,calls=0;
 await db.ref('fcmTokens/storeA/d').set({token:'token'});
 await db.ref('pushUpdates/retry').set({recipients:['storeA'],action:'notification-test',createdAt:now});
 const dispatch=require('../../functions/notifications').createUpdateDispatcher(db,{send:async()=>{calls++;const e=new Error('service unavailable');e.code='messaging/server-unavailable';throw e;}},()=>clock);
 await dispatch('retry');assert.equal(calls,1);assert.ok((await db.ref('pushUpdateRetries/retry').get()).exists());
 await dispatch('retry');assert.equal(calls,1);
 clock+=60000;await dispatch('retry');assert.equal(calls,2);
 clock+=120000;await dispatch('retry');assert.equal(calls,3);assert.equal((await db.ref('pushUpdateRetries/retry').get()).exists(),false);
 await dispatch('retry');assert.equal(calls,3);
});
