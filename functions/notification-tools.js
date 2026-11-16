'use strict';
const { DomainError } = require('./domain');
function createNotificationTools(db, getPublicConfig, clock=Date.now) {
  return async (auth,input) => {
    if(!auth?.uid) throw new DomainError('unauthenticated','Entre na sua conta.');
    const uid=auth.uid;
    const [store,courier]=await Promise.all([db.ref(`profiles/stores/${uid}`).get(),db.ref(`profiles/couriers/${uid}`).get()]);
    if(!store.exists()&&!courier.exists()) throw new DomainError('permission-denied','Use uma conta de loja ou motoboy.');
    if(input?.action==='config') {
      const config=getPublicConfig();
      if(!config.vapidPublicKey) throw new DomainError('failed-precondition','A chave pública de notificações ainda não está configurada no servidor.');
      return {vapidPublicKey:config.vapidPublicKey};
    }
    if(input?.action!=='test') throw new DomainError('invalid-argument','Operação de notificação inválida.');
    const [tokens,subscriptions]=await Promise.all([db.ref(`fcmTokens/${uid}`).get(),db.ref(`pushSubscriptions/${uid}`).get()]);
    if(!Object.keys(tokens.val()||{}).length&&!Object.keys(subscriptions.val()||{}).length) throw new DomainError('failed-precondition','Nenhum dispositivo cadastrado nesta conta. Ative antes de testar.');
    const now=clock();
    const reservation=await db.ref(`notificationTestLimits/${uid}`).transaction(last=>last!==null&&now-last<60000?undefined:now);
    if(!reservation.committed) throw new DomainError('resource-exhausted','Aguarde um minuto entre testes.');
    const entry=db.ref('pushUpdates').push();
    await entry.set({action:'notification-test',recipients:[uid],createdAt:now});
    return {requested:true};
  };
}
module.exports={createNotificationTools};
