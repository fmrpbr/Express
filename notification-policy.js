(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExpressNotificationPolicy=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SCHEMA='sound-v1';
const LEGACY={order:'express_orders_v2',quote:'express_quotes_v2',reminder:'express_reminders_v2',update:'express_updates_v2',alert:'express_updates_v2'};
const CHANNELS={order:'express_orders_sound_v1',quote:'express_quotes_sound_v1',reminder:'express_reminders_sound_v1',update:'express_updates_sound_v1',alert:'express_alerts_sound_v1'};
const LABELS={order:'Novos pedidos',quote:'Novas cotações',reminder:'Lembretes',update:'Atualizações de entregas',alert:'Alertas operacionais'};
function category(value){return Object.hasOwn(CHANNELS,value)?value:'update';}
function channel(device,kind){return (device.notificationSchema===SCHEMA?CHANNELS:LEGACY)[category(kind)];}
function validWebEndpoint(endpoint){try{const u=new URL(endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(u.hostname==='fcm.googleapis.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.push.services.mozilla.com')||u.hostname.endsWith('.notify.windows.com'));}catch(_){return false;}}
function failure(error){const code=String(error?.code||error?.statusCode||'unknown').slice(0,120);return {code,invalid:['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code)||[404,410].includes(error?.statusCode),retryable:['messaging/server-unavailable','messaging/quota-exceeded','messaging/message-rate-exceeded'].includes(code)||[429,503].includes(error?.statusCode)};}
return {SCHEMA,LEGACY,CHANNELS,LABELS,category,channel,validWebEndpoint,failure};
});
