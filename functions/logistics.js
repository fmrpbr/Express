'use strict';
const RETURN_WINDOW=300000;
const MAX_ROUTE_STOPS=20;
const actions=new Set(['getCapabilities','requestReturn','releaseReturn','cancelReturn','createRoute','releaseRoute','dissolveRoute','routePickup','finishRouteStop','publishDraft','discardDraft','cancelRoute']);
const inProgress=o=>o&&o.status==='run';
function complete(o,who,uid,now){Object.assign(o,{status:'done',completed:now,durationMs:Math.max(0,now-o.accepted),paid:false,paymentStatus:'pending',paymentSchemaVersion:2,location:null});if(who.pix)o.paymentPix={...who.pix};}
function careFor(state,o){
 if(o.kind!=='route')return {fragile:o.fragile===true,importantNotes:o.importantNotes===true,notes:o.fragile||o.importantNotes?o.notes||'':'',revision:Number(o.revision||0)};
 const stops=o.routeOrderIds.map(id=>state.orders[id]);
 return {fragile:stops.some(s=>s.fragile),importantNotes:stops.some(s=>s.importantNotes),notes:stops.filter(s=>s.fragile||s.importantNotes).map(s=>'ENTREGA '+s.routeSequence+' · '+s.clientNeighborhood+(s.fragile?' · FRÁGIL':'')+(s.notes?'\n'+s.notes:'')).join('\n\n'),revision:Number(o.revision||0)};
}
function linkRoundtrip(state,id,o,previous,completing,ctx,a){
 const {fail,commit}=a;const {now,uid,requestId}=ctx;
 if(o.serviceType!=='roundtrip'||o.status==='cotacao')return;
 // Legacy roundtrips keep their contracted value and original execution flow.
 if(previous&&!completing&&!previous.roundtripSchema)return;
 const secondId=previous?.returnOrderId||id+'_return';
 const old=state.orders?.[secondId];
 fail(!old||['awaiting_return','awaiting_quote_return'].includes(old.status),'A devolução já foi solicitada.');
 let firstFee,secondFee,total;
 if(previous?.roundtripSchema&&!completing){firstFee=previous.fee;secondFee=old.fee;total=Math.round((firstFee+secondFee)*100)/100;}
 else if(completing){const cents=Math.round(o.fee*100);fail(cents>=2,'A cotação deve cobrir as duas viagens.');firstFee=Math.floor(cents/2)/100;secondFee=(cents-Math.floor(cents/2))/100;total=cents/100;}
 else{firstFee=o.fee;secondFee=o.fee;total=Math.round(o.fee*200)/100;}
 Object.assign(o,{serviceType:'collection',roundtripSchema:1,roundtripGroupId:id,legNumber:1,returnOrderId:secondId,roundtripTotalFee:total,fee:firstFee});
 if(completing)o.agreedFee=firstFee;
 const second={...o,id:undefined,orderCode:o.orderCode+'-VOLTA',serviceType:'delivery',legNumber:2,firstOrderId:id,status:'awaiting_return',fee:secondFee,created:old?.created||now,revision:old?.revision||0,offerGeneration:0,paid:false};
 for(const field of ['id','returnOrderId','courierId','assignedCourierId','courierName','accepted','picked','tripStage','queuePosition','location','bids','trackingToken','trackingExpiresAt','quoteAcceptedAt','careAcknowledgedAt','careAcknowledgedBy'])delete second[field];
 if(o.agreedFee!==undefined)second.agreedFee=secondFee;else delete second.agreedFee;
 if(second.priceSnapshot)second.priceSnapshot={...second.priceSnapshot,fee:secondFee};
 commit(state,secondId,second,old,now,uid,'prepare-return',requestId);
}
function expireReturns(state,now,a){let changed=false;for(const [id,timer]of Object.entries(state.returnTimers||{})){
 if(timer.until>now)continue;
 const o=state.orders?.[id];a.put(state,'returnTimers/'+id,null);changed=true;
 if(o?.status==='return_priority'&&o.priorityUntil<=now){const before=structuredClone(o);o.status='open';o.offerGeneration=Number(o.offerGeneration||0)+1;o.priorityReleasedAt=now;o.priorityReleaseReason='timeout';a.commit(state,id,o,before,now,'server','return-timeout','timer_'+timer.until);changed=true;}
 }return changed;}
function afterOrder(state,id,o,previous,ctx,a){
 if(!o.roundtripSchema||o.legNumber!==1)return;
 const second=state.orders?.[o.returnOrderId];if(!second)return;
 if(['cancelled','cancelado_cotacao'].includes(o.status)&&['awaiting_return','awaiting_quote_return'].includes(second.status)){
  const before=structuredClone(second);Object.assign(second,{status:'cancelled',cancelledAt:ctx.now,cancelledBy:ctx.uid});a.commit(state,o.returnOrderId,second,before,ctx.now,ctx.uid,'cancel-return',ctx.requestId);
 }
 if(o.status==='cotacao'&&previous?.status!=='cotacao'){
  const before=structuredClone(second);Object.assign(second,{status:'awaiting_quote_return',fee:0,roundtripTotalFee:0});delete second.agreedFee;
  o.serviceType='roundtrip';o.roundtripTotalFee=0;
  a.commit(state,o.returnOrderId,second,before,ctx.now,ctx.uid,'requote-return',ctx.requestId);
 }
}
function dispatch(state,uid,who,action,id,input,ctx,a){
 const {fail,key,put,commit,projectOrder,courierSlots}=a;const now=ctx.now;let o=id?state.orders?.[id]:null;
 const owner=()=>fail(who?.role==='store'&&o?.storeId===uid,'Pedido de outra loja.','permission-denied');
 const rider=()=>fail(who?.role==='courier'&&o?.courierId===uid,'Corrida de outro motoboy.','permission-denied');
 const change=(targetId,target,before,what=action)=>commit(state,targetId,target,before,now,uid,what,ctx.requestId);
 if(action==='getCapabilities')return {ok:true,logisticsVersion:1,maxRouteStops:MAX_ROUTE_STOPS,returnPriorityMs:RETURN_WINDOW};
 if(action==='createRoute'){
  fail(who?.role==='store','Somente lojistas criam rotas.','permission-denied');
  fail(Array.isArray(input.orderIds)&&input.orderIds.length>=2&&input.orderIds.length<=MAX_ROUTE_STOPS,'Selecione de 2 a '+MAX_ROUTE_STOPS+' entregas.');
  const ids=input.orderIds.map(x=>key(x));fail(new Set(ids).size===ids.length,'Entrega repetida na rota.');
  const stops=ids.map(k=>state.orders?.[k]);
  for(const stop of stops)fail(stop&&stop.storeId===uid&&stop.serviceType==='delivery'&&!stop.roundtripSchema&&!stop.routeId&&!stop.kind&&['open','route_draft'].includes(stop.status)&&!stop.courierId&&!stop.assignedCourierId,'Use entregas simples da mesma loja, sem motoboy e fora de outras rotas.');
  fail(stops.every(s=>s.serviceDate===stops[0].serviceDate),'Agrupe entregas da mesma data.');
  fail(stops.every(s=>s.storeAddress===stops[0].storeAddress),'As entregas devem ter o mesmo ponto de coleta.');
  const routeId=ctx.newId;const fee=stops.reduce((sum,s)=>sum+Math.round(s.fee*100),0)/100;
  const route={kind:'route',orderCode:'ROTA-'+routeId.slice(-8).toUpperCase(),storeId:uid,storeName:who.name,storeAddress:stops[0].storeAddress,status:'route_open',serviceType:'route',serviceDate:stops[0].serviceDate,city:stops[0].city,clientNeighborhood:stops.map(s=>s.clientNeighborhood).join(' · '),routeOrderIds:ids,deliveryCount:ids.length,completedStops:0,routeValues:stops.map(s=>({neighborhood:s.clientNeighborhood,fee:s.fee})),fee,fragile:stops.some(s=>s.fragile),importantNotes:stops.some(s=>s.importantNotes),created:now,revision:0,offerGeneration:1};
  ids.forEach((stopId,index)=>{const stop=stops[index],before=structuredClone(stop);Object.assign(stop,{routeId,routeSequence:index+1,routeOriginalStatus:stop.status,status:'grouped'});change(stopId,stop,before,'group-route');});
  change(routeId,route,null);return {ok:true,orderId:routeId};
 }
 fail(o,'Pedido não encontrado.','not-found');const before=structuredClone(o);
 if(['requestReturn','releaseReturn','cancelReturn'].includes(action)){
  fail(o.roundtripSchema===1&&o.legNumber===2,'Este pedido não é uma devolução.');
  const first=state.orders?.[o.firstOrderId];fail(first?.status==='done','Conclua a recolha na loja antes de solicitar a devolução.');
  if(action==='requestReturn'){
   owner();fail(o.status==='awaiting_return','Devolução já solicitada ou encerrada.');
   fail(first.courierId,'Motoboy da recolha não encontrado.');
   Object.assign(o,{status:'return_priority',priorityCourierId:first.courierId,priorityUntil:now+RETURN_WINDOW,requestedAt:now,offerCreatedAt:now,offerGeneration:Number(o.offerGeneration||0)+1});
   put(state,'returnTimers/'+id,{until:o.priorityUntil});
  }else if(action==='releaseReturn'){
   fail((who?.role==='store'&&o.storeId===uid)||(who?.role==='courier'&&o.priorityCourierId===uid),'Somente a loja ou o motoboy prioritário pode liberar.','permission-denied');
   fail(o.status==='return_priority','A devolução já está aberta ou foi aceita.');
   Object.assign(o,{status:'open',priorityReleasedAt:now,priorityReleaseReason:'manual',offerGeneration:Number(o.offerGeneration||0)+1});put(state,'returnTimers/'+id,null);
  }else{owner();fail(['awaiting_return','return_priority','open'].includes(o.status),'Não é possível cancelar a devolução nesta etapa.');Object.assign(o,{status:'cancelled',cancelledAt:now,cancelledBy:uid});put(state,'returnTimers/'+id,null);}
  change(id,o,before);return {ok:true,orderId:id};
 }
 if(action==='publishDraft'||action==='discardDraft'){owner();fail(o.status==='route_draft'&&!o.routeId,'Esta entrega já foi publicada ou agrupada.');o.status=action==='publishDraft'?'open':'cancelled';if(action==='discardDraft'){o.cancelledAt=now;o.cancelledBy=uid;}o.offerGeneration=Number(o.offerGeneration||0)+1;change(id,o,before);return {ok:true,orderId:id};}
 fail(o.kind==='route','Rota não encontrada.');
 const stops=o.routeOrderIds.map(stopId=>state.orders[stopId]);
 if(action==='cancelRoute'){
  owner();fail(o.status==='route_open'||o.status==='run'&&!o.picked&&o.accepted&&now-o.accepted>=1500000,'Cancele antes do aceite ou após 25 minutos sem coleta.');
  for(const [index,stop]of stops.entries()){const old=structuredClone(stop);Object.assign(stop,{status:'cancelled',cancelledAt:now,cancelledBy:uid,location:null});change(o.routeOrderIds[index],stop,old,'cancel-route-stop');}
  Object.assign(o,{status:'route_cancelled',cancelledAt:now,routeEndReason:'cancelled',location:null});
 }else if(action==='releaseRoute'){
  rider();fail(o.status==='run'&&!o.picked,'Uma rota só pode ser devolvida antes da coleta.');
  for(const [index,stop]of stops.entries()){const old=structuredClone(stop);stop.status='grouped';for(const f of ['courierId','courierName','accepted','picked','queuePosition','location','careAcknowledgedAt','careAcknowledgedBy'])delete stop[f];change(o.routeOrderIds[index],stop,old,'release-route-stop');}
  o.status='route_open';o.offerGeneration=Number(o.offerGeneration||0)+1;for(const f of ['courierId','courierName','accepted','picked','queuePosition','location','careAcknowledgedAt','careAcknowledgedBy'])delete o[f];
 }else if(action==='dissolveRoute'){
  owner();fail(o.status==='route_open','Desagrupe antes do aceite do motoboy.');
  for(const [index,stop]of stops.entries()){const old=structuredClone(stop);stop.status=stop.routeOriginalStatus==='open'?'open':'route_draft';delete stop.routeId;delete stop.routeSequence;delete stop.routeOriginalStatus;stop.offerGeneration=Number(stop.offerGeneration||0)+1;change(o.routeOrderIds[index],stop,old,'ungroup-route');}
  o.status='route_cancelled';o.cancelledAt=now;o.routeEndReason='dissolved';
 }else if(action==='routePickup'){
  rider();fail(o.status==='run'&&!o.picked,'Coleta já confirmada ou rota encerrada.');o.picked=now;
  for(const [index,stop]of stops.entries()){const old=structuredClone(stop);stop.picked=now;change(o.routeOrderIds[index],stop,old,'route-pickup');}
 }else if(action==='finishRouteStop'){
  rider();fail(o.status==='run'&&o.picked,'Confirme a coleta da rota na loja.');
  const stopId=key(input.stopId);const next=o.routeOrderIds.find(k=>state.orders[k].status!=='done');fail(stopId===next,'Conclua a próxima entrega da sequência.');
  const stop=state.orders[stopId],old=structuredClone(stop);fail(stop.routeId===id&&stop.courierId===uid&&inProgress(stop),'Entrega não pertence à sua rota.','permission-denied');
  complete(stop,who,uid,now);change(stopId,stop,old,'finish');o.completedStops=stops.filter(s=>s.status==='done').length;
  if(o.completedStops===o.deliveryCount)Object.assign(o,{status:'route_done',completed:now,durationMs:now-o.accepted,location:null});
 }else fail(false,'Ação de rota inválida.');
 change(id,o,before);return {ok:true,orderId:id};
}
function acceptRoute(state,id,o,who,uid,now,input,a){
 a.fail(input.logisticsVersion===1,'Atualize o aplicativo para aceitar uma rota múltipla.');
 a.fail(a.courierSlots(state,uid,id).length===0,'Conclua todas as corridas antes de aceitar uma rota múltipla.');
 for(const stopId of o.routeOrderIds){const stop=state.orders[stopId],before=structuredClone(stop);a.fail(stop.routeId===id&&stop.status==='grouped'&&!stop.courierId,'A rota foi alterada. Confira novamente.');Object.assign(stop,{status:'run',courierId:uid,courierName:who.name,accepted:now});if(stop.fragile||stop.importantNotes){stop.careAcknowledgedAt=now;stop.careAcknowledgedBy=uid;}a.commit(state,stopId,stop,before,now,uid,'route-accepted',input.requestId||'route');}
}
module.exports={handles:action=>actions.has(action),dispatch,linkRoundtrip,afterOrder,expireReturns,careFor,acceptRoute,RETURN_WINDOW,MAX_ROUTE_STOPS};
