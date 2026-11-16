'use strict';
const {DomainError}=require('./domain');
const Policy=require('./notification-policy');
function createNotificationTools(db,getPublicConfig,clock=Date.now){return async(auth,input)=>{
 if(!auth?.uid)throw new DomainError('unauthenticated','Entre na sua conta.');
 const uid=auth.uid;
 const [store,courier]=await Promise.all([db.ref(`profiles/stores/${uid}`).get(),db.ref(`profiles/couriers/${uid}`).get()]);
 if(!store.exists()&&!courier.exists()&&auth.token?.admin!==true)throw new DomainError('permission-denied','Use uma conta de loja ou motoboy.');
 if(input?.action==='config'){
  const config=getPublicConfig();
  if(!config.vapidPublicKey)throw new DomainError('failed-precondition','A chave pública de notificações ainda não está configurada no servidor.');
  return {vapidPublicKey:config.vapidPublicKey,version:'2.0.9'};
 }
 if(input?.action==='status'){
  if(typeof input.eventId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(input.eventId))throw new DomainError('invalid-argument','Teste inválido.');
  const result=(await db.ref(`pushTestResults/${uid}/${input.eventId}`).get()).val();
  if(!result)throw new DomainError('not-found','Teste não encontrado nesta conta.');
  return {requestedAt:result.requestedAt,devices:Object.values(result.devices||{}).map(d=>({status:d.status,platform:d.platform,code:d.code||null}))};
 }
 if(input?.action!=='test')throw new DomainError('invalid-argument','Operação de notificação inválida.');
 const [native,web]=await Promise.all([db.ref(`fcmTokens/${uid}`).get(),db.ref(`pushSubscriptions/${uid}`).get()]);
 const tokens=native.val()||{},subscriptions=web.val()||{};
 if(!Object.keys(tokens).length&&!Object.keys(subscriptions).length)throw new DomainError('failed-precondition','Nenhum dispositivo cadastrado nesta conta. Ative antes de testar.');
 let target=null;
 if(input.target){
  const {platform,id}=input.target;
  if(!['android','web'].includes(platform)||typeof id!=='string'||!Object.hasOwn(platform==='android'?tokens:subscriptions,id))throw new DomainError('permission-denied','Este dispositivo não está cadastrado nesta conta. Ative novamente.');
  target={platform,id};
 }
 const now=clock();const reservation=await db.ref(`notificationTestLimits/${uid}`).transaction(last=>last!==null&&now-last<60000?undefined:now);
 if(!reservation.committed)throw new DomainError('resource-exhausted','Aguarde um minuto entre testes.');
 const entry=db.ref('pushUpdates').push();
 if(entry.key)await db.ref(`pushTestResults/${uid}/${entry.key}`).set({requestedAt:now});
 await entry.set({action:'notification-test',recipients:[uid],category:Policy.category(input.category),createdAt:now,expiresAt:now+300000,...(target?{testTarget:target}:{})});
 return {requested:true,eventId:entry.key||null};
};}
module.exports={createNotificationTools};
