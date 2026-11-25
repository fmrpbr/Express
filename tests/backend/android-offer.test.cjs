const test = require('node:test');
const assert = require('node:assert/strict');
const { androidMessage, offerKey, currentOfferKey, createAndroidDecline } = require('../../functions/android-offer');

const uid = 'courierA';
const id = 'orderA';
const notificationId = 'a'.repeat(64);
const now = 100000;
const device = { id:'phone', token:'fcm-token', notificationSchema:'sound-v1', offerActions:true, offerSound:true };
const base = {
  device, uid, delivery:null, data:{type:'order', category:'order',orderId:id,notificationId},
  title:'Nova oferta', body:'Consulte a oferta.', ttl:30000, now
};

test('compatibility keeps ordinary notifications for older APKs and uses actionable data for couriers', async () => {
  const key = offerKey({offerGeneration:2}, 'public');
  const legacy = await androidMessage({...base, device:{...device,offerActions:false}, key});
  assert.equal(legacy.notification.title, 'Nova oferta');
  assert.equal(legacy.data.offerMode, undefined);
  const native = await androidMessage({...base, key});
  assert.equal(native.notification, undefined);
  assert.equal(native.android.priority, 'high');
  assert.equal(native.data.channelId, 'express_courier_offers_v2');
  assert.equal(native.data.noticeKey, 'public:2');
  assert.equal(native.data.owner, uid);
  assert.equal(native.data.declineToken, undefined);
  assert.equal(currentOfferKey({orders:{[id]:{offerGeneration:3}}}, id, native.data.noticeKey), false);
});

test('a private decline is valid only for its offer, registered device and short-lived token', async () => {
  let grant, currentDevice=device, time=now;
  const received = [];
  const round = {generation:1,round:2,expiresAt:now+30000};
  const order = {offerGeneration:1};
  const delivery = { child(name) {
    assert.equal(name, 'offerResponse');
    return {set:async value => { grant=value; }};
  } };
  const notice = await androidMessage({...base, delivery, key:offerKey(order,'round',round)});
  const token = notice.data.declineToken;
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(grant.digest, token);
  const db = { ref(path) {return {get:async () => ({val:() => path.startsWith('pushDeliveries/') ? grant : currentDevice})};} };
  const decline = createAndroidDecline(db, async (auth, request) => received.push({auth,request}), () => time);
  assert.equal(currentOfferKey({orders:{[id]:order},offerRounds:{[id]:round}}, id, grant.key), true);
  assert.equal(currentOfferKey({orders:{[id]:order},offerRounds:{[id]:{...round,round:3}}}, id, grant.key), false);
  assert.equal(await decline({deliveryId:notificationId,token:'b'.repeat(64)}),404);
  currentDevice={...device,token:'replacement-fcm-token'};
  assert.equal(await decline({deliveryId:notificationId,token}),404);
  currentDevice=device;
  assert.equal(await decline({deliveryId:notificationId,token}),204);
  assert.deepEqual(received[0].auth,{uid});
  assert.equal(received[0].request.action,'decline-offer');
  assert.equal(received[0].request.input.noticeKey,grant.key);
  time=grant.expiresAt;
  assert.equal(await decline({deliveryId:notificationId,token}),404);
  assert.equal(received.length,1);
});

test('test notifications show the buttons without corresponding to an actual order', async () => {
  const message = await androidMessage({...base,data:{type:'test',category:'order',notificationId},key:''});
  assert.equal(message.data.noticeKey,'test');
  assert.equal(message.data.orderId,undefined);
  assert.equal(message.data.declineToken,undefined);
});
