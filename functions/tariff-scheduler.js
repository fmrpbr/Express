const {settle}=require('./tariffs');
async function activateTariffs(db,now=Date.now()){
  // Primeiro callback pode não ter cache local. O servidor resolve a comparação
  // antes de aplicar avisos, sem substituir os dados existentes.
  return db.ref().transaction(state=>state===null?{}:settle(state,now)||undefined,undefined,false);
}
module.exports={activateTariffs};
