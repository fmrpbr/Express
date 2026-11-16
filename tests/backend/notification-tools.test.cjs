const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createNotificationTools}=require('../../functions/notification-tools');
function fixture(){
  const state={'profiles/stores/store':{name:'Test'},'fcmTokens/store':{device:{token:'secret-token'}}};
  let id=0;
  const db={ref(path){return {get:async()=>({exists:()=>!!state[path],val:()=>state[path]||null}),transaction:async fn=>{const next=fn(state[path]??null);if(next===undefined)return {committed:false};state[path]=next;return {committed:true};},push:()=>db.ref(path+'/'+(++id)),set:async value=>{state[path]=value;}};}};
  return {state,run:createNotificationTools(db,()=>({vapidPublicKey:'public-key',privateKey:'never-return'}),()=>100000)};
}
test('notification config requires authentication and a registered profile',async()=>{
  const {run}=fixture();await assert.rejects(run(null,{action:'config'}),e=>e.code==='unauthenticated');
  await assert.rejects(run({uid:'stranger'},{action:'config'}),e=>e.code==='permission-denied');
  assert.deepEqual(await run({uid:'store'},{action:'config'}),{vapidPublicKey:'public-key',version:'2.0.9'});
});
test('test notification only targets own uid, ignores supplied recipients and is rate limited',async()=>{
  const {run,state}=fixture();
  await run({uid:'store'},{action:'test',recipients:['victim']});
  assert.deepEqual(state['pushUpdates/1'].recipients,['store']);
  assert.equal(state['pushUpdates/1'].action,'notification-test');
  await assert.rejects(run({uid:'store'},{action:'test'}),e=>e.code==='resource-exhausted');
});
test('no phantom successful test when no devices were registered',async()=>{
  const {run,state}=fixture();delete state['fcmTokens/store'];
  await assert.rejects(run({uid:'store'},{action:'test'}),e=>e.code==='failed-precondition');
  assert.equal(state['pushUpdates/1'],undefined);
});

test('a targeted test rejects another account/device and status is scoped to its owner',async()=>{
 const {run,state}=fixture();
 await assert.rejects(run({uid:'store'},{action:'test',target:{platform:'android',id:'not-owned'}}),e=>e.code==='permission-denied');
 await assert.rejects(run({uid:'store'},{action:'status',eventId:'another-account-event'}),e=>e.code==='not-found');
 state['pushTestResults/store/own']={requestedAt:123,devices:{x:{status:'sent',platform:'android',token:'DO NOT RETURN'}}};
 assert.deepEqual(await run({uid:'store'},{action:'status',eventId:'own'}),{requestedAt:123,devices:[{status:'sent',platform:'android',code:null}]});
});
