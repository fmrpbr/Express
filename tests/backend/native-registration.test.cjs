const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const html=fs.readFileSync('www/index.html','utf8');
const source=html.slice(html.indexOf('  async function saveNativeFcmToken('),html.indexOf('  const NotificationPolicy='));
function setup(command){const context={currentUser:{uid:'owner'},role:'courier',tokenKeyForDevice:null,localStorage:{getItem:()=> 'device'},digestKey:async()=> 'hashed-token',window:{Capacitor:{isNativePlatform:()=>true},ExpressNotificationPolicy:{SCHEMA:'sound-v1'}},command};vm.createContext(context);vm.runInContext(source,context);return context;}
test('Android activation only succeeds after schema acknowledgement, never after changing account',async()=>{
 const old=setup(async()=>({ok:true}));await assert.rejects(old.saveNativeFcmToken('token'),/Atualize as funções/);assert.equal(old.tokenKeyForDevice,null);
 const current=setup(async()=>({notificationSchema:'sound-v1'}));await current.saveNativeFcmToken('token');assert.equal(current.tokenKeyForDevice,'hashed-token');
 let changed;changed=setup(async()=>{changed.currentUser={uid:'other'};return {notificationSchema:'sound-v1'};});await assert.rejects(changed.saveNativeFcmToken('token'),/sessão mudou/);assert.equal(changed.tokenKeyForDevice,null);
});
