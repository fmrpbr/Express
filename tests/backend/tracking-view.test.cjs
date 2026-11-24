const test = require('node:test');
const assert = require('node:assert/strict');
const now = 1800000000000;
const model = () => import('../../tracking/view-model.mjs');
test('public tracking distinguishes queued service without leaking fields or trusting unsafe map coordinates',async()=>{
  const {trackingView}=await model();
  const view=trackingView({status:'run',queuePosition:2,expiresAt:now+50000,revoked:false,client:'SECRET',phone:'SECRET',fee:99,orderCode:'EXP-1',location:{lat:999,lng:0,updatedAt:now}},now);
  assert.match(view.status,/próxima/);
  assert.equal(view.location,null);
  assert.ok(!JSON.stringify(view).includes('SECRET'));
  assert.equal(view.fee,undefined);
});
test('expired, revoked and ended tracking clears map and order code',async()=>{
  const {trackingView}=await model();
  for(const extra of [{expiresAt:now},{revoked:true}]){
    const view=trackingView({status:'run',expiresAt:now+50000,revoked:false,orderCode:'EXP-1',location:{lat:1,lng:2,updatedAt:now},...extra},now);
    assert.equal(view.ended,true);assert.equal(view.location,undefined);assert.equal(view.code,undefined);
  }
});
test('fresh route shows distance, approximate time and a map from the courier to the drop-off',async()=>{
  const {trackingView,embedLocation}=await model();
  const tracking={status:'run',phase:'to-delivery',expiresAt:now+500000,revoked:false,location:{lat:-19.8,lng:-40.2,updatedAt:now,accuracy:20}};
  const route={phase:tracking.phase,calculatedAt:now,locationAt:now,meters:1400,seconds:350,destination:{lat:-19.81,lng:-40.21}};
  const view=trackingView(tracking,now,route);
  assert.equal(view.estimate.meters,1400);
  const map=new URL(embedLocation(view,'example'));
  assert.equal(map.pathname,'/maps/embed/v1/directions');
  assert.equal(map.searchParams.get('origin'),'-19.8,-40.2');
  assert.equal(map.searchParams.get('destination'),'-19.81,-40.21');
  assert.equal(trackingView(tracking,now+180000,route).stale,true);
  assert.equal(trackingView(tracking,now+180000,route).estimate,null);
  assert.equal(trackingView(tracking,now,{...route,meters:40}).arrived,true);
  assert.equal(trackingView({...tracking,arrivedAt:now},now).arrived,true);
  const complete=trackingView({...tracking,status:'done',completedAt:now},now,route);
  assert.equal(complete.status,'Entrega concluída');
  assert.equal(complete.location,undefined);
});
