const {test}=require('node:test');const assert=require('node:assert/strict');
const {applyCommand,courierSlots,courierLoad,settleReturns}=require('../../functions/domain');const {eligibleRecipient}=require('../../functions/notifications');const P=require('../../functions/payments');
const now=Date.parse('2026-11-16T15:00:00Z');let seq=0;
const fixture=()=>({profiles:{stores:{shop:{name:'LOJA',address:'RUA DA LOJA'},other:{name:'OUTRA',address:'OUTRA RUA'}},couriers:{a:{name:'MOTO A',pix:{key:'a@test.com',holder:'A',type:'email'}},b:{name:'MOTO B',pix:{key:'b@test.com',holder:'B',type:'email'}}}},courierPresence:{a:{availableForWork:true},b:{availableForWork:true}}});
const fields=(extra={})=>({serviceType:'delivery',serviceDate:'2026-11-16',city:'ARACRUZ',clientNeighborhood:'CENTRO',client:'PRIVADO',phone:'27999999999',clientStreet:'RUA PRIVADA',clientNumber:'1',paymentMethod:'money',...extra});
function run(state,uid,action,id=null,input={},over={}){const c={action,orderId:id,input,requestId:over.requestId||'r'+(++seq)};return applyCommand(state,{uid,token:{}},c,{now,newId:over.newId||'id'+seq,token:'a'.repeat(64),fingerprint:JSON.stringify(c),...over});}
function add(state,id,extra={}){return run(state,'shop','saveOrder',null,fields(extra),{newId:id}).state;}
function pair(){return add(fixture(),'first',{serviceType:'roundtrip'});}
function finishFirst(s){s=run(s,'a','accept','first').state;s=run(s,'a','picked','first').state;return run(s,'a','finish','first').state;}
function route(){let s=fixture();for(const id of ['one','two','three'])s=add(s,id,{routeDraft:true,clientNeighborhood:id});return run(s,'shop','createRoute',null,{orderIds:['three','one','two']},{newId:'route'}).state;}
test('duas viagens geram dois valores, só a recolha entra na fila e cada motoboy recebe seu trecho',()=>{
 let s=pair();assert.equal(s.orders.first.fee,7);assert.equal(s.orders.first_return.fee,7);assert.equal(s.orders.first.roundtripTotalFee,14);assert.equal(s.orders.first.serviceType,'collection');assert.equal(s.orders.first_return.status,'awaiting_return');assert.equal(s.availableOrders.first_return,undefined);
 assert.throws(()=>run(s,'shop','requestReturn','first_return'),/Conclua/);
 s=finishFirst(s);assert.equal(courierSlots(s,'a').length,0);assert.equal(s.courierPresence.a.busy,false);assert.equal(P.summary(Object.values(s.orders)).total,7);
 s.config={rates:{zones:{'Sede e Bairros (Padrão)':99}}};s=run(s,'shop','requestReturn','first_return').state;
 assert.equal(s.orders.first_return.fee,7);assert.equal(courierSlots(s,'a').length,0);assert.equal(s.courierOffers.a.first_return.isPriorityOffer,true);
 assert.throws(()=>run(s,'b','accept','first_return'),/prioridade/);
 s=run(s,'a','releaseReturn','first_return').state;s=run(s,'b','accept','first_return').state;s=run(s,'b','picked','first_return').state;s=run(s,'b','finish','first_return').state;
 s=run(s,'shop','report-payment','first').state;s=run(s,'a','confirm-payment','first').state;
 assert.throws(()=>run(s,'a','confirm-payment','first_return'),/outro motoboy/);
 s=run(s,'shop','report-payment','first_return').state;s=run(s,'b','confirm-payment','first_return').state;
 assert.equal(s.orders.first.paymentPix.key,'a@test.com');assert.equal(s.orders.first_return.paymentPix.key,'b@test.com');assert.equal(P.summary(Object.values(s.orders)).received,14);
});
test('prioridade termina em 5 minutos pelo relógio do servidor, sem ocupar vaga ou depender do app aberto',()=>{
 let s=run(finishFirst(pair()),'shop','requestReturn','first_return').state;const deadline=s.orders.first_return.priorityUntil;assert.equal(deadline,now+300000);
 assert.equal(eligibleRecipient(s,'a',s.orders.first_return,'order','first_return',now),true);assert.equal(eligibleRecipient(s,'b',s.orders.first_return,'order','first_return',deadline-1),false);
 assert.throws(()=>run(s,'b','previewOrderCare','first_return',{}, {now:deadline-1}),/indisponível/);
 assert.equal(eligibleRecipient(s,'b',s.orders.first_return,'order','first_return',deadline),true);
 const expired=settleReturns(s,deadline);assert.equal(expired.orders.first_return.status,'open');assert.equal(expired.courierOffers.a.first_return,undefined);assert.equal(expired.returnTimers.first_return,undefined);assert.equal(settleReturns(expired,deadline+1),null);
 // Aceite libera a oferta no instante exato mesmo antes da próxima execução do agendador.
 const accepted=run(s,'b','accept','first_return',{}, {now:deadline}).state;assert.equal(accepted.orders.first_return.courierId,'b');assert.equal(courierLoad(accepted,'a'),0);
});
test('somente loja ou primeiro motoboy liberam prioridade; cancelar a volta preserva a primeira viagem devida',()=>{
 let s=run(finishFirst(pair()),'shop','requestReturn','first_return').state;
 assert.throws(()=>run(s,'b','releaseReturn','first_return'),/Somente/);assert.throws(()=>run(s,'other','releaseReturn','first_return'),/Somente/);
 assert.equal(run(s,'shop','releaseReturn','first_return').state.orders.first_return.status,'open');
 s=run(s,'shop','cancelReturn','first_return').state;assert.equal(s.orders.first.status,'done');assert.equal(P.summary(Object.values(s.orders)).total,7);assert.equal(s.returnTimers.first_return,undefined);
});
test('cotação de duas viagens divide o total contratado sem perder centavos',()=>{
 let s=add(fixture(),'quote',{serviceType:'roundtrip',isQuote:true});s=run(s,'a','send-bid','quote',{amount:25.01}).state;s=run(s,'shop','accept-bid','quote',{courierId:'a',amount:25.01}).state;s=run(s,'shop','saveOrder','quote',fields({serviceType:'roundtrip'})).state;
 assert.equal(s.orders.quote.fee,12.5);assert.equal(s.orders.quote_return.fee,12.51);assert.equal(s.orders.quote.roundtripTotalFee,25.01);assert.equal(s.orders.quote.assignedCourierId,'a');
 s=run(s,'shop','saveOrder','quote',fields({serviceType:'roundtrip',notes:'EDITADO'})).state;assert.equal(s.orders.quote_return.agreedFee,12.51);
 s=run(s,'a','cancel','quote').state;assert.equal(s.orders.quote.status,'cotacao');assert.equal(s.orders.quote_return.status,'awaiting_quote_return');
});
test('rota preserva valores, sequência e privacidade; impede aceite individual e agrupamento cruzado',()=>{
 let s=route();assert.equal(s.orders.route.fee,21);assert.equal(s.availableOrders.route.deliveryCount,3);assert.deepEqual(s.availableOrders.route.routeValues.map(x=>x.neighborhood),['THREE','ONE','TWO']);assert.equal(s.availableOrders.one,undefined);assert.equal(s.pushJobs.one,undefined);
 const publicText=JSON.stringify(s.availableOrders.route);for(const privateValue of ['PRIVADO','RUA PRIVADA','27999999999','storeId','routeOrderIds'])assert.equal(publicText.includes(privateValue),false);
 assert.throws(()=>run(s,'a','accept','one'),/rota/);assert.throws(()=>run(s,'other','createRoute',null,{orderIds:['one','two']}),/mesma loja/);
 assert.throws(()=>run(s,'shop','createRoute',null,{orderIds:['one','one']}),/repetida/);
 assert.throws(()=>run(s,'a','accept','route'),/Atualize/);
});
test('rota exclusiva bloqueia novas corridas, propostas e outra rota; conclusão e pagamentos são individuais',()=>{
 let s=route();s=add(s,'single');s=add(s,'quote',{isQuote:true});s=run(s,'a','accept','route',{logisticsVersion:1}).state;
 assert.equal(courierLoad(s,'a'),2);assert.equal(Object.values(s.pushUpdates||{}).filter(x=>['accept','route-accepted'].includes(x.action)).length,1);assert.equal(s.courierPresence.a.routeActive,true);assert.equal(s.courierOrders.a.one.status,'run');
 assert.throws(()=>run(s,'a','accept','single'),/Limite/);assert.throws(()=>run(s,'a','send-bid','quote',{amount:5}),/Limite/);assert.equal(eligibleRecipient(s,'a',s.orders.single,'order','single',now),false);
 assert.throws(()=>run(s,'shop','saveOrder','one',fields()),/editado/);assert.throws(()=>run(s,'a','picked','one'),/rota/);assert.throws(()=>run(s,'a','finish','route'),/controles/);
 assert.throws(()=>run(s,'a','finishRouteStop','route',{stopId:'three'}),/coleta/);
 s=run(s,'a','routePickup','route').state;assert.throws(()=>run(s,'a','releaseRoute','route'),/antes da coleta/);
 assert.throws(()=>run(s,'a','finishRouteStop','route',{stopId:'one'}),/sequência/);
 s=run(s,'a','finishRouteStop','route',{stopId:'three'}).state;assert.equal(s.orders.route.completedStops,1);assert.equal(P.summary(Object.values(s.orders)).total,7);assert.equal(courierLoad(s,'a'),2);
 s=run(s,'shop','report-payment','three').state;s=run(s,'a','confirm-payment','three').state;assert.equal(P.summary(Object.values(s.orders)).received,7);
 s=run(s,'a','finishRouteStop','route',{stopId:'one'}).state;s=run(s,'a','finishRouteStop','route',{stopId:'two'}).state;
 assert.equal(s.orders.route.status,'route_done');assert.equal(courierLoad(s,'a'),0);assert.equal(s.courierPresence.a.routeActive,false);assert.equal(P.summary(Object.values(s.orders)).total,21);assert.equal(run(s,'a','accept','single').state.orders.single.status,'run');
});
test('rota exige motoboy totalmente livre e só pode ser devolvida inteira antes da coleta',()=>{
 let s=route();s=add(s,'single');s=run(s,'a','accept','single').state;assert.throws(()=>run(s,'a','accept','route',{logisticsVersion:1}),/Limite/);
 s=run(s,'b','accept','route',{logisticsVersion:1}).state;assert.throws(()=>run(s,'a','accept','route',{logisticsVersion:1}),/Limite|aceita/);
 s=run(s,'b','releaseRoute','route').state;assert.equal(courierLoad(s,'b'),0);assert.equal(s.orders.route.status,'route_open');assert.equal(s.orders.one.status,'grouped');assert.equal(s.courierOrders.b.one,undefined);
 s=run(s,'shop','dissolveRoute','route').state;assert.equal(s.orders.route.status,'route_cancelled');assert.equal(s.orders.one.status,'route_draft');assert.equal(s.orders.one.routeId,undefined);
 s=run(s,'shop','publishDraft','one').state;assert.equal(s.availableOrders.one.fee,7);
});
test('cuidados de cada parada entram na confirmação da rota e GPS chega aos clientes sem expor a lista completa',()=>{
 let s=fixture();s=add(s,'one',{fragile:true,notes:'MANTER EM PÉ'});s=add(s,'two',{importantNotes:true,notes:'NÃO BUZINAR'});s=run(s,'shop','createRoute',null,{orderIds:['one','two']},{newId:'route'}).state;
 const care=run(s,'a','previewOrderCare','route').result.care;assert.match(care.notes,/MANTER EM PÉ/);assert.match(care.notes,/NÃO BUZINAR/);
 assert.throws(()=>run(s,'a','accept','route',{logisticsVersion:1}),/Leia/);
 s=run(s,'a','accept','route',{logisticsVersion:1,careAcknowledged:true,careRevision:care.revision}).state;
 s=run(s,'shop','tracking','one').state;s=run(s,'a','location','route',{lat:-19.8,lng:-40.2}).state;
 assert.deepEqual(s.orders.one.location,s.orders.route.location);const tracking=Object.values(s.publicTracking)[0];assert.deepEqual(tracking.location,s.orders.one.location);assert.equal(tracking.routeOrderIds,undefined);
});
test('rascunho pode ser descartado; rota não coletada pode ser cancelada sem criar cobrança',()=>{
 let s=add(fixture(),'draft',{routeDraft:true});s=run(s,'shop','discardDraft','draft').state;assert.equal(s.orders.draft.status,'cancelled');assert.equal(P.summary(Object.values(s.orders)).total,0);
 s=run(route(),'a','accept','route',{logisticsVersion:1}).state;assert.throws(()=>run(s,'shop','cancelRoute','route'),/25 minutos/);
 s=run(s,'shop','cancelRoute','route',{}, {now:now+1500000}).state;assert.equal(courierLoad(s,'a'),0);assert.equal(P.summary(Object.values(s.orders)).total,0);for(const id of ['one','two','three'])assert.equal(s.orders[id].status,'cancelled');
});
