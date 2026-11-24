const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../www/index.html'),'utf8');
const source=html.slice(html.indexOf('  function devicePushPreference('),html.indexOf('  const NotificationPolicy='));
function setup(command){const storage=new Map([['express_device_id','device']]);const context={currentUser:{uid:'owner'},role:'courier',render(){},pushRegistration:null,leavingPushSession:false,accountAllowed:()=>true,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},digestKey:async()=> 'hashed-token',window:{ExpressNotificationPolicy:{SCHEMA:'sound-v1'}},command};vm.createContext(context);vm.runInContext(source,context);return context;}
test('Android activation only succeeds after schema acknowledgement, never after changing account',async()=>{
 const old=setup(async()=>({ok:true}));await assert.rejects(old.saveNativeFcmToken('token','owner'),/Atualize as funções/);assert.equal(old.pushRegistration,null);
 const current=setup(async()=>({notificationSchema:'sound-v1'}));await current.saveNativeFcmToken('token','owner');assert.equal(current.pushRegistration.id,'hashed-token');
 let changed;changed=setup(async()=>{changed.currentUser={uid:'other'};return {notificationSchema:'sound-v1'};});await assert.rejects(changed.saveNativeFcmToken('token','owner'),/sessão de notificações mudou/);assert.equal(changed.pushRegistration,null);
});
test('Android preserves a manual notification pause on the same device',async()=>{
 let calls=0;
 const session=setup(async()=>{calls++;return {notificationSchema:'sound-v1'};});
 session.saveDevicePushPreference('owner',{enabled:false});
 await session.saveNativeFcmToken('token','owner');
 assert.equal(calls,0);
 assert.equal(session.pushRegistration,null);
});
