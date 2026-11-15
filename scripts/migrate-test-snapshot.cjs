// Conversão OFFLINE. Não lê nem escreve no Firebase.
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { projectOrder } = require('../functions/domain');
function migrate(original, now = Date.now()) {
  const state = structuredClone(original);
  state.profiles ||= { stores:{}, couriers:{} };
  for(const kind of ['stores','couriers']) {
    state.profiles[kind] ||= {};
    for(const [uid, entry] of Object.entries(state[kind] || {})) {
      if(!state.profiles[kind][uid]) state.profiles[kind][uid] = {
        name:String(entry.name || '').trim().toLocaleUpperCase('pt-BR'),
        phone:String(entry.phone || ''),email:String(entry.email || ''),address:String(entry.address || '').trim().toLocaleUpperCase('pt-BR'),created:Number(entry.created || now)
      };
    }
  }
  for(const uid of Object.keys(state.profiles.stores)) if(state.profiles.couriers[uid]) throw new Error('UID possui dois perfis. Resolva o conflito antes da migração.');
  const originalOrders=structuredClone(state.orders || {});
  for(const field of ['storeOrders','courierOrders','availableOrders','quoteBoard','publicTracking','courierBids','pushJobs']) state[field]={};
  state.courierConnections={};
  state.courierPresence={};
  for(const uid of Object.keys(state.profiles.couriers)) state.courierPresence[uid]={registered:true,online:false,busy:false,availableForWork:false,lastSeen:now};
  const review=[];
  for(const [id, originalOrder] of Object.entries(originalOrders)) {
    const order=structuredClone(originalOrder);
    if(!state.profiles.stores[order.storeId] || (order.courierId && !state.profiles.couriers[order.courierId])) {review.push(id);continue;}
    order.schemaVersion=2;order.revision=Number(order.revision || 0);order.offerGeneration=Number(order.offerGeneration || 1);order.updatedAt=now;
    // Revoga links legados; novos tokens são emitidos pelo servidor após a revisão.
    delete order.trackingToken;delete order.trackingExpiresAt;
    projectOrder(state,id,order,null,now);
    for(const [uid,bid] of Object.entries(order.bids || {})) if(state.profiles.couriers[uid]) { state.courierBids[uid] ||= {};state.courierBids[uid][id]=bid; }
  }
  for(const [uid,tokens] of Object.entries(state.fcmTokens || {})) {
    const clean={};
    for(const entry of Object.values(tokens)) if(entry?.token) clean[createHash('sha256').update(entry.token).digest('hex')]=entry;
    state.fcmTokens[uid]=clean;
  }
  return { state, review };
}
if(require.main === module) {
  const [input,output]=process.argv.slice(2);
  if(!input||!output) throw new Error('Uso: node scripts/migrate-test-snapshot.cjs entrada.json saida.json');
  const result=migrate(JSON.parse(fs.readFileSync(input,'utf8')));
  if(result.review.length) throw new Error(`${result.review.length} pedido(s) com perfil ausente. Corrija o snapshot antes de converter.`);
  fs.writeFileSync(output,JSON.stringify(result.state,null,2),{flag:'wx',mode:0o600});
  console.log('Snapshot convertido offline. Revisar e testar antes de qualquer importação autorizada.');
}
module.exports={migrate};
