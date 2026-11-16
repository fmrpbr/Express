const {test}=require('node:test');
const assert=require('node:assert/strict');
const T=require('../../functions/tariffs');
const {applyCommand}=require('../../functions/domain');
const defaults=require('../../functions/default-rates.json');
const now=Date.parse('2026-11-16T15:00:00Z');
const fields={serviceType:'delivery',serviceDate:'2026-11-16',city:'ARACRUZ',clientNeighborhood:'CENTRO',client:'CLIENTE',clientStreet:'RUA',clientNumber:'1',paymentMethod:'money'};
const rates={schemaVersion:1,zones:{...defaults.zones,[T.SEDE]:5},sedeDay:5,sedeNight:7,rainSede:2,night:3,bag:10,bankService:10,cardMinimum:10,lateMinimum:10};
const fixture=()=>({profiles:{stores:{shop:{name:'LOJA',address:'RUA'}},couriers:{rider:{name:'MOTO'},rider2:{name:'MOTO 2'}}},courierPresence:{rider:{availableForWork:true}}});
let seq=0;
function run(state,uid,action,input={},orderId,at=now,newId='id_'+(++seq)){
 const command={action,input,orderId,requestId:'req_'+(++seq)};
 return applyCommand(state,{uid,token:{admin:uid==='admin'}},command,{now:at,newId,token:'a'.repeat(64),fingerprint:JSON.stringify(command)});
}
const schedule=(state=fixture(),extra={})=>run(state,'admin','scheduleRates',{rates,baseVersion:'legacy',effectiveAt:now+60000,...extra});

test('tabela exige admin, antecedência, revisão atual e valores válidos',()=>{
 assert.throws(()=>run(fixture(),'shop','scheduleRates',{rates,effectiveAt:now+60000}),/administrativo/);
 assert.throws(()=>schedule(fixture(),{effectiveAt:now+59999}),/minuto/);
 assert.throws(()=>schedule(fixture(),{baseVersion:'stale'}),/outro acesso/);
 assert.throws(()=>schedule(fixture(),{rates:{...rates,sedeDay:5.123}}),/duas casas/);
 assert.throws(()=>schedule(fixture(),{rates:{...rates,zones:{[T.SEDE]:5}}}),/Preserve/);
 const first=schedule();
 assert.throws(()=>schedule(first.state),/outro acesso/);
});
test('tarifa muda no instante exato, gera avisos e não altera pedidos existentes nem edições',()=>{
 let state=run(fixture(),'shop','saveOrder',fields,undefined,now,'old').state;
 const before=structuredClone(state.orders.old);
 const planned=schedule(state);state=planned.state;
 assert.deepEqual(state.orders.old,before);
 const notices=Object.values(state.pushUpdates);
 assert.equal(notices[0].action,'announcement');assert.deepEqual(notices[0].recipients.sort(),['rider','rider2','shop']);
 state=run(state,'shop','saveOrder',fields,undefined,now+59999,'before').state;
 state=run(state,'shop','saveOrder',fields,undefined,now+60000,'after').state;
 assert.equal(state.orders.before.fee,7);assert.equal(state.orders.after.fee,5);
 state=run(state,'shop','saveOrder',{...fields,notes:'EDITADO'},'old',now+90000).state;
 assert.equal(state.orders.old.fee,7);
 assert.throws(()=>run(state,'shop','saveOrder',{...fields,selectedZone:'Shopping Oriundi'},'old',now+90000),/novo pedido/);
 state=run(state,'rider','accept',{rain:true},'old',now+90000).state;
 assert.equal(state.orders.old.fee,7);
 assert.ok(state.orders.after.priceSnapshot.tariffPlanId);
});
test('sede cobre limites 06h e 19h, incluindo madrugada, e chuva somente na sede',()=>{
 const price=(time,rain=false,selectedZone='')=>T.price({selectedZone},rates,{id:'rain',enabled:rain},Date.parse('2026-11-16T'+time+'-03:00')).fee;
 for(const [time,fee] of [['05:59:59',7],['06:00:00',5],['18:59:59',5],['19:00:00',7],['23:59:59',7],['00:00:00',7]]){assert.equal(price(time),fee);assert.equal(price(time,true),fee+2);}
 assert.equal(price('12:00:00',true,'Shopping Oriundi'),10);
 assert.equal(price('20:00:00',true,'Shopping Oriundi'),13);
 const old=T.resolve({},now,defaults);const legacy=T.price({paymentMethod:'card'},old,{enabled:false},Date.parse('2026-11-16T20:00:00-03:00'));
 assert.equal(legacy.fee,13);
});
test('chuva tem agendamento e sinais distintos, sem ativação automática nem cobrança retroativa',()=>{
 let state=schedule().state;
 state=run(state,'admin','scheduleRain',{enabled:true,effectiveAt:now+120000}).state;
 assert.equal(T.rain(state.config,now+119999).enabled,false);
 assert.equal(T.rain(state.config,now+120000).enabled,true);
 state=run(state,'rider','signalRain').state;
 assert.throws(()=>run(state,'rider','signalRain'),/cinco/);
 state=run(state,'rider2','signalRain').state;
 assert.equal(state.config.rainSummary.count,2);
 assert.equal(T.rain(state.config,now).enabled,false);
 assert.throws(()=>run(state,'shop','signalRain'),/Somente/);
});
test('cancelamento futuro avisa todos, mantém histórico e impede aplicação do plano',()=>{
 let scheduled=schedule(),state=scheduled.state;
 const planId=Object.keys(state.config.tariffPlans)[0];
 state=run(state,'admin','cancelRates',{planId}).state;
 assert.equal(T.resolve(state.config,now+120000,defaults).id,'legacy');
 assert.ok(state.config.tariffPlans[planId]);
 assert.equal(state.systemNotices['tariff_scheduled_'+planId].expiresAt,now);
 assert.throws(()=>run(scheduled.state,'admin','cancelRates',{planId},undefined,now+60000),/futuro/);
});
test('agendador publica ativação uma única vez, mesmo sem pedidos, e respeita cancelamentos',()=>{
 const state=schedule().state;
 assert.equal(T.settle(state,now+59999),null);
 const activated=T.settle(state,now+60000);
 assert.equal(Object.keys(activated.systemNotices).length,2);
 assert.equal(T.settle(activated,now+61000),null);
 assert.equal(T.settle(run(state,'admin','cancelRates',{planId:Object.keys(state.config.tariffPlans)[0]}).state,now+60000),null);
});
test('horário do agendamento é sempre Aracruz e não depende do fuso do aparelho',()=>{
 assert.equal(T.toInput(now),'2026-11-16T12:00');
 assert.equal(T.fromInput('2026-11-16T12:00'),now);
 assert.throws(()=>T.fromInput('2026-02-30T12:00'),/inválido/);
});
