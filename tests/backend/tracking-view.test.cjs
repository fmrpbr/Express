const test = require('node:test');
const assert = require('node:assert/strict');
const now = 1800000000000;
const model = () => import('../../tracking/view-model.mjs');
test('public tracking distinguishes queued service without leaking fields or trusting unsafe map coordinates',async()=>{
  const {trackingView}=await model();
  const view=trackingView({status:'run',queuePosition:2,expiresAt:now+50000,revoked:false,client:'SECRET',phone:'SECRET',fee:99,orderCode:'EXP-1',location:{lat:999,lng:0,updatedAt:now}},now);
  assert.match(view.status,/próxima/);
  assert.equal(view.map,null);
  assert.ok(!JSON.stringify(view).includes('SECRET'));
  assert.equal(view.fee,undefined);
});
test('expired, revoked and ended tracking clears map and order code',async()=>{
  const {trackingView}=await model();
  for(const extra of [{expiresAt:now},{revoked:true},{status:'done'}]){
    const view=trackingView({status:'run',expiresAt:now+50000,revoked:false,orderCode:'EXP-1',location:{lat:1,lng:2,updatedAt:now},...extra},now);
    assert.equal(view.ended,true);assert.equal(view.map,undefined);assert.equal(view.code,undefined);
  }
});
test('old GPS is identified as stale, with a valid external map URL',async()=>{
  const {trackingView}=await model();
  const view=trackingView({status:'run',queuePosition:1,expiresAt:now+50000,revoked:false,location:{lat:-19.8,lng:-40.2,updatedAt:now-180000}},now);
  assert.equal(view.stale,true);assert.ok(view.map.startsWith('https://www.google.com/maps/'));
});
