const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyCommand}=require('../../functions/domain');
const {eligibleRecipient}=require('../../functions/notifications');
const now=1794834000000;
let count=0;
const fixture=()=>({profiles:{stores:{shop:{name:'LOJA',address:'RUA 1'}},couriers:{rider:{name:'MOTO'},other:{name:'OUTRO'}}},courierPresence:{rider:{availableForWork:true},other:{availableForWork:true}}});
const fields={serviceType:'delivery',serviceDate:'2026-11-16',city:'Aracruz',clientNeighborhood:'Centro',client:'CLIENTE',clientStreet:'RUA',clientNumber:'1',notes:'MANTER EM PÉ',fragile:true,importantNotes:true};
function run(state,uid,action,input={},orderId=null,admin=false){const command={action,input,orderId,requestId:'op_'+(++count)};return applyCommand(state,{uid,token:{admin,email:'test@example.test'}},command,{now,newId:'order1',token:'a'.repeat(64),fingerprint:JSON.stringify(command)});}
test('novo cadastro fica pendente; só admin aprova/reprova/bloqueia e registro antigo continua ativo',()=>{
 let state=run(fixture(),'newUser','createProfile',{role:'courier',name:'NOVO',phone:'27999999999',accessStatus:'approved'}).state;
 assert.equal(state.profiles.couriers.newUser.accessStatus,'pending');
 assert.throws(()=>run(state,'newUser','registerDevice',{token:'x'.repeat(30),deviceId:'phone'}),/Acesso pendente/);
 assert.throws(()=>run(state,'shop','setAccountAccess',{uid:'newUser',role:'courier',status:'approved',expectedStatus:'pending'}),/administrativo/);
 state=run(state,'admin','setAccountAccess',{uid:'newUser',role:'courier',status:'approved',expectedStatus:'pending'},null,true).state;
 assert.equal(state.profiles.couriers.newUser.accessStatus,'approved');
 assert.ok(run(state,'newUser','registerDevice',{token:'x'.repeat(30),deviceId:'phone'}).result.ok);
 assert.ok(run(state,'shop','saveOrder',fields).result.ok);
 assert.throws(()=>run(state,'admin','setAccountAccess',{uid:'newUser',role:'courier',status:'blocked',expectedStatus:'pending',reason:'TESTE'},null,true),/Cadastro alterado/);
 assert.throws(()=>run(state,'admin','setAccountAccess',{uid:'newUser',role:'courier',status:'blocked',expectedStatus:'approved'},null,true),/motivo/);
 state.courierPresence.newUser.availableForWork=true;state.courierConnections={newUser:{session:{lastSeen:now}}};
 state=run(state,'admin','setAccountAccess',{uid:'newUser',role:'courier',status:'blocked',expectedStatus:'approved',reason:'VERIFICAR CADASTRO'},null,true).state;
 assert.equal(state.courierPresence.newUser.availableForWork,false);assert.equal(state.courierConnections.newUser,undefined);
 assert.throws(()=>run(state,'newUser','savePix',{}),/Acesso pendente/);
 assert.ok(Object.values(state.adminEvents).some(e=>e.status==='blocked'&&e.actorUid==='admin'));
});
test('reprovado e bloqueado não recebem novas ofertas nem são escolhidos em cotação',()=>{
 for(const status of ['pending','rejected','blocked']){
  const state=fixture();state.profiles.couriers.rider.accessStatus=status;
  assert.equal(eligibleRecipient(state,'rider',{status:'open'},'order','id'),false);
  assert.throws(()=>run(state,'rider','previewOrderCare',{},'order1'),/Acesso pendente/);
 }
});
test('cuidados exigem confirmação da revisão atual e preservam preço e privacidade',()=>{
 let state=run(fixture(),'shop','saveOrder',fields).state;
 assert.equal(state.availableOrders.order1.fragile,true);assert.equal(state.availableOrders.order1.notes,undefined);
 assert.throws(()=>run(state,'shop','previewOrderCare',{},'order1'),/disponibilidade/);
 const care=run(state,'rider','previewOrderCare',{},'order1').result.care;
 assert.equal(care.notes,fields.notes);
 assert.throws(()=>run(state,'rider','accept',{},'order1'),/Leia e confirme/);
 state=run(state,'shop','saveOrder',{...fields,notes:'NÃO EMPILHAR'},'order1').state;
 assert.throws(()=>run(state,'rider','accept',{careAcknowledged:true,careRevision:care.revision},'order1'),/atualizados/);
 const fresh=run(state,'rider','previewOrderCare',{},'order1').result.care;
 const fee=state.orders.order1.fee;
 state=run(state,'rider','accept',{careAcknowledged:true,careRevision:fresh.revision},'order1').state;
 assert.equal(state.orders.order1.careAcknowledgedBy,'rider');assert.equal(state.orders.order1.fee,fee);
 assert.equal(state.courierOrders.rider.order1.notes,'NÃO EMPILHAR');
 assert.throws(()=>run(state,'other','previewOrderCare',{},'order1'),/indisponível/);
 assert.throws(()=>run(fixture(),'shop','saveOrder',{...fields,notes:''}),/observação importante/);
});
test('somente autor/admin cancela alerta, preserva histórico e remove envio ainda pendente',()=>{
 let state=fixture();state.alerts={alert1:{senderId:'shop',message:'AVISO',createdAt:now-1000,expiresAt:now+7200000}};state.pushUpdates={alert_alert1:{action:'operational-alert'}};
 assert.throws(()=>run(state,'rider','cancelAlert',{alertId:'alert1'}),/autor ou administrador/);
 state=run(state,'shop','cancelAlert',{alertId:'alert1'}).state;
 assert.equal(state.alerts.alert1.message,'AVISO');assert.equal(state.alerts.alert1.status,'cancelled');assert.equal(state.alerts.alert1.cancelledBy,'shop');assert.equal(state.pushUpdates.alert_alert1,undefined);
 assert.throws(()=>run(state,'shop','cancelAlert',{alertId:'alert1'}),/já foi cancelado/);
 delete state.alerts.alert1.cancelledAt;
 assert.equal(run(state,'admin','cancelAlert',{alertId:'alert1'},null,true).state.alerts.alert1.cancelledBy,'admin');
});
test('bloqueio também impede reaproveitar recibo antigo com dados privados',()=>{
 const state=fixture();const cmd={action:'previewOrderCare',orderId:'order1',requestId:'old_receipt'};
 state.profiles.couriers.rider.accessStatus='blocked';state.operationReceipts={rider:{old_receipt:{fingerprint:JSON.stringify(cmd),result:{care:{notes:'PRIVADO'}}}}};
 assert.throws(()=>applyCommand(state,{uid:'rider',token:{}},cmd,{now,fingerprint:JSON.stringify(cmd)}),/Acesso pendente/);
});
