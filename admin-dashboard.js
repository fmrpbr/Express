(function(root,factory){
  const payments=typeof module==='object'&&module.exports?require('../functions/payments'):root.ExpressPayments;
  const api=factory(payments);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ExpressAdmin=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(payments){
  'use strict';
  const defaults=()=>({store:'',courier:'',period:'all',from:'',to:'',status:'all',payment:'all',alert:'all',search:''});
  const cancelled=o=>['cancelled','cancelado_cotacao'].includes(o.status);
  const cents=o=>Math.round(Number(o.fee||0)*100);
  const validLocation=(loc,now)=>!!loc&&Number.isFinite(loc.lat)&&Number.isFinite(loc.lng)&&Math.abs(loc.lat)<=90&&Math.abs(loc.lng)<=180&&Number(loc.updatedAt)>0&&Number(loc.updatedAt)<=now+60000;
  function alerts(order,now=Date.now()){
    const result=[];
    if(order.status==='open'&&order.created>0&&now-order.created>=900000)result.push({kind:'waiting',priority:2,label:'Pedido aberto há 15 minutos ou mais'});
    if(order.status==='run'){
      if(!order.picked&&order.accepted>0&&now-order.accepted>=1500000)result.push({kind:'pickup',priority:0,label:'Retirada não registrada há 25 minutos ou mais'});
      if(validLocation(order.location,now)){
        if(now-order.location.updatedAt>120000)result.push({kind:'gps',priority:1,label:'Localização sem atualização há mais de 2 minutos'});
      }else if(order.accepted>0&&now-order.accepted>=120000)result.push({kind:'gps',priority:1,label:'Corrida sem localização válida após 2 minutos'});
    }
    if(payments.isOverdue(order,now))result.push({kind:'payment',priority:3,label:payments.paymentState(order)==='reported'?'Pagamento informado em dia anterior: conferir recebimento':'Pagamento de dia anterior ainda não informado'});
    return result;
  }
  function filterOrders(orders,filters={},now=Date.now()){
    const f={...defaults(),...filters};
    const today=payments.dayKey(now);
    const first=f.period==='today'?today:f.period==='7'?payments.dayKey(now-6*86400000):f.period==='30'?payments.dayKey(now-29*86400000):f.period==='custom'?f.from:'';
    const last=f.period==='custom'?f.to:f.period==='all'?'':today;
    const search=String(f.search||'').trim().toLocaleUpperCase('pt-BR');
    return orders.filter(o=>{
      if(f.store&&o.storeId!==f.store)return false;
      if(f.courier&&(o.courierId||o.assignedCourierId)!==f.courier)return false;
      const day=payments.dayKey(o.created);
      if((first&&(!day||day<first))||(last&&(!day||day>last)))return false;
      if(f.status==='cancelled'?!cancelled(o):f.status==='quotes'?!['cotacao','cotacao_aceita'].includes(o.status):f.status!=='all'&&o.status!==f.status)return false;
      if(f.payment!=='all'&&(o.status!=='done'||payments.paymentState(o)!==f.payment))return false;
      const issues=alerts(o,now);
      if(f.alert==='any'&&!issues.length)return false;
      if(!['all','any'].includes(f.alert)&&!issues.some(x=>x.kind===f.alert))return false;
      if(search&&![o.orderCode,o.id,o.storeName,o.courierName,o.client,o.clientNeighborhood].some(v=>String(v||'').toLocaleUpperCase('pt-BR').includes(search)))return false;
      return true;
    }).sort((a,b)=>Number(b.created||0)-Number(a.created||0)||String(a.id).localeCompare(String(b.id)));
  }
  function overview(orders,now=Date.now()){
    const result={total:orders.length,open:0,run:0,done:0,cancelled:0,quotes:0,pending:0,reported:0,confirmed:0,unreportedValue:0,issues:[]};
    for(const order of orders){
      if(cancelled(order))result.cancelled++;
      else if(['cotacao','cotacao_aceita'].includes(order.status))result.quotes++;
      else if(['open','run','done'].includes(order.status))result[order.status]++;
      if(order.status==='done'){
        const state=payments.paymentState(order);result[state]++;
        if(state==='pending')result.unreportedValue+=cents(order);
      }
      for(const issue of alerts(order,now))result.issues.push({...issue,order});
    }
    result.unreportedValue/=100;
    result.issues.sort((a,b)=>a.priority-b.priority||Number(a.order.created||0)-Number(b.order.created||0));
    result.finance=payments.summary(orders,now);
    return result;
  }
  function team(couriers,orders,presence=[],connections={},now=Date.now()){
    const roster=couriers.map(courier=>{
      const p=presence.find(p=>p.id===courier.id)||{};
      const sessions=Object.values(connections[courier.id]||{});
      const online=sessions.some(s=>s.lastSeen>0&&s.lastSeen<=now+60000&&now-s.lastSeen<90000);
      const assigned=orders.filter(o=>(o.courierId||o.assignedCourierId)===courier.id&&(o.status==='run'||o.status==='cotacao_aceita'||(o.status==='open'&&o.assignedCourierId===courier.id)));
      const locations=assigned.filter(o=>o.status==='run'&&validLocation(o.location,now)).map(o=>o.location).sort((a,b)=>b.updatedAt-a.updatedAt);
      return {id:courier.id,name:courier.name||'Motoboy',online,available:p.availableForWork===true,slots:assigned.length,running:assigned.filter(o=>o.status==='run').length,assigned,location:locations[0]||null};
    }).sort((a,b)=>Number(b.online)-Number(a.online)||b.slots-a.slots||a.name.localeCompare(b.name,'pt-BR'));
    return {roster,total:roster.length,online:roster.filter(r=>r.online).length,offline:roster.filter(r=>!r.online).length,zero:roster.filter(r=>r.slots===0).length,one:roster.filter(r=>r.slots===1).length,two:roster.filter(r=>r.slots>=2).length,available:roster.filter(r=>r.online&&r.available&&r.slots<2).length};
  }
  return {defaults,filterOrders,overview,alerts,team,validLocation,cancelled};
});
