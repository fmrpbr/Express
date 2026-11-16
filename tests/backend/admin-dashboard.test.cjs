const {test}=require('node:test');
const assert=require('node:assert/strict');
const A=require('../../www/admin-dashboard');
const now=Date.parse('2026-11-16T15:00:00Z');
const order=extra=>({id:'a',storeId:'shop',courierId:'rider',status:'done',created:now,completed:now,fee:5,...extra});

test('admin separa estados e distingue pagamento informado de recebimento confirmado',()=>{
 const os=[order({id:'pending',fee:0.1}),order({id:'reported',fee:0.2,paymentStatus:'reported'}),order({id:'old',fee:7,paid:true}),order({id:'run',status:'run',fee:999}),order({id:'open',status:'open'}),order({id:'cancel',status:'cancelled'}),order({id:'cancelQuote',status:'cancelado_cotacao'}),order({id:'quote',status:'cotacao'}),order({id:'reserved',status:'cotacao_aceita'})];
 const s=A.overview(os,now);
 assert.equal(s.total,9);assert.equal(s.done,3);assert.equal(s.run,1);assert.equal(s.open,1);assert.equal(s.cancelled,2);assert.equal(s.quotes,2);
 assert.equal(s.pending,1);assert.equal(s.reported,1);assert.equal(s.confirmed,1);
 assert.equal(s.unreportedValue,0.1);assert.equal(s.finance.total,7.3);assert.equal(s.finance.received,7);assert.equal(s.finance.pending,0.3);
});

test('filtros combinam loja, motoboy, período, busca e confirmação financeira sem misturar contas',()=>{
 const os=[order({id:'match',orderCode:'EXP-42',clientNeighborhood:'CENTRO',paymentStatus:'reported'}),order({id:'otherShop',storeId:'other',paymentStatus:'reported'}),order({id:'otherRider',courierId:'other',paymentStatus:'reported'}),order({id:'paid',paid:true}),order({id:'yesterday',created:now-86400000,paymentStatus:'reported'})];
 assert.deepEqual(A.filterOrders(os,{store:'shop',courier:'rider',period:'today',payment:'reported',search:'exp-42'},now).map(o=>o.id),['match']);
 assert.equal(A.filterOrders(os,{payment:'confirmed'},now).length,1);
 assert.equal(A.filterOrders(os,{search:'<script>'},now).length,0);
});

test('período segue a data de criação em Aracruz, inclusive meia-noite e limites inclusivos',()=>{
 const at=Date.parse('2026-11-16T03:00:00Z');
 const os=[order({id:'today',created:at}),order({id:'yesterday',created:at-1}),order({id:'missing',created:0})];
 assert.deepEqual(A.filterOrders(os,{period:'today'},at).map(o=>o.id),['today']);
 assert.deepEqual(A.filterOrders(os,{period:'custom',from:'2026-11-15',to:'2026-11-15'},at).map(o=>o.id),['yesterday']);
 assert.equal(A.filterOrders(os,{},at).length,3);
});

test('alertas respeitam 15 minutos, 25 minutos e mais de 2 minutos de GPS sem falsos atrasos iniciais',()=>{
 assert.equal(A.alerts(order({status:'open',created:now-899999}),now).length,0);
 assert.equal(A.alerts(order({status:'open',created:now-900000}),now)[0].kind,'waiting');
 const active=order({status:'run',accepted:now-1500000,location:{lat:-19.8,lng:-40.2,updatedAt:now-120000}});
 assert.deepEqual(A.alerts(active,now).map(x=>x.kind),['pickup']);
 assert.deepEqual(A.alerts({...active,location:{...active.location,updatedAt:now-120001}},now).map(x=>x.kind),['pickup','gps']);
 assert.equal(A.alerts(order({status:'run',accepted:now-119999}),now).length,0);
 assert.equal(A.alerts(order({status:'run',accepted:now-120000}),now)[0].kind,'gps');
 assert.equal(A.alerts({...active,picked:now,location:{...active.location,updatedAt:now}},now).length,0);
 assert.equal(A.alerts({...active,status:'cancelled'},now).length,0);
});

test('pendência de dia anterior informada pede conferência sem afirmar falta de pagamento',()=>{
 const old=order({created:now-86400000,completed:now-86400000,paymentStatus:'reported'});
 assert.match(A.alerts(old,now)[0].label,/conferir recebimento/);
 assert.equal(A.alerts({...old,paid:true},now).length,0);
 assert.deepEqual(A.filterOrders([old,order({id:'today'})],{alert:'payment'},now).map(o=>o.id),['a']);
});

test('equipe conta reservas e duas corridas pelo estado canônico e exige uma sessão recente',()=>{
 const couriers=[{id:'rider',name:'A'},{id:'reserved',name:'B'},{id:'offline',name:'C'}];
 const os=[order({id:'run1',status:'run'}),order({id:'run2',status:'run'}),order({id:'done'}),order({id:'reserve',courierId:'reserved',status:'cotacao_aceita'})];
 const presence=[{id:'rider',occupiedSlots:99,online:true,availableForWork:true},{id:'reserved',availableForWork:true},{id:'offline',online:true}];
 const connections={rider:{old:{lastSeen:now-100000},fresh:{lastSeen:now-1}},reserved:{fresh:{lastSeen:now-89999}},offline:{expired:{lastSeen:now-90000}}};
 const team=A.team(couriers,os,presence,connections,now);
 assert.equal(team.total,3);assert.equal(team.online,2);assert.equal(team.offline,1);assert.equal(team.zero,1);assert.equal(team.one,1);assert.equal(team.two,1);assert.equal(team.available,1);
 assert.equal(team.roster.find(r=>r.id==='rider').slots,2);
 assert.equal(A.team(couriers,os,presence,{},now).online,0);
 assert.equal(A.team(couriers,os,presence,{rider:{future:{lastSeen:now+60001}}},now).online,0);
});

test('GPS inválido nunca gera coordenadas confiáveis para o painel',()=>{
 for(const loc of [null,{lat:999,lng:0,updatedAt:now},{lat:'-19',lng:0,updatedAt:now},{lat:0,lng:0,updatedAt:now+60001}])assert.equal(A.validLocation(loc,now),false);
 assert.equal(A.validLocation({lat:0,lng:0,updatedAt:now},now),true);
});
