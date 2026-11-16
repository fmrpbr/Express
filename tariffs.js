(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExpressTariffs=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SEDE='Sede e Bairros (Padrão)';
  const MIN_NOTICE=60000;
  function toInput(now){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));const v=k=>parts.find(p=>p.type===k).value;return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;}
  function fromInput(value){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Informe data e horário.');const desired=Date.parse(value+'Z');const guess=desired+(desired-Date.parse(toInput(desired)+'Z'));if(!Number.isFinite(guess)||toInput(guess)!==value)throw Error('Data ou horário inválido.');return guess;}
  function latest(plans={},cancelled={},now=Date.now()){
    return Object.entries(plans).filter(([id,p])=>!cancelled[id]&&p.effectiveAt<=now).sort((a,b)=>b[1].effectiveAt-a[1].effectiveAt||b[0].localeCompare(a[0]))[0];
  }
  function head(plans={}){return Object.entries(plans).sort((a,b)=>b[1].createdAt-a[1].createdAt||b[0].localeCompare(a[0]))[0]?.[0]||'legacy';}
  function resolve(config={},now=Date.now(),defaults={}){
    const plan=latest(config.tariffPlans,config.tariffCancellations,now);
    return plan?{id:plan[0],...plan[1].rates}:{id:'legacy',...defaults,...config.rates,zones:{...defaults.zones,...config.rates?.zones}};
  }
  function rain(config={},now=Date.now()) {const p=latest(config.rainPlans,{},now);return {id:p?.[0]||'none',enabled:p?.[1].enabled===true&&!!latest(config.tariffPlans,config.tariffCancellations,now)};}
  function price(input,rates,weather,now=Date.now()){
    const zone=input.selectedZone||SEDE;
    let fee=Number(rates.zones?.[zone]);
    if(!Number.isFinite(fee)||fee<0)throw Error('Zona sem tarifa configurada.');
    const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));
    const modern=rates.schemaVersion===1;
    if(modern&&zone===SEDE){fee=hour>=19||hour<6?rates.sedeNight:rates.sedeDay;if(input.paymentMethod==='card')fee=Math.max(fee,Number(rates.cardMinimum??10));}
    else {if(input.paymentMethod==='card')fee=Math.max(fee,Number(rates.cardMinimum??10));if(hour>=23)fee=Math.max(fee,Number(rates.lateMinimum??10));else if(hour>=18)fee+=Number(rates.night??3);}
    if(input.bank)fee=Math.max(fee,Number(rates.bankService??10));
    if(input.bag)fee+=Number(rates.bag??10);
    const rainFee=modern&&zone===SEDE&&weather.enabled?Number(rates.rainSede):0;
    fee=Math.round((fee+rainFee)*100)/100;
    return {fee,snapshot:{tariffPlanId:rates.id||'legacy',rainPlanId:weather.id||'none',rainFee,zone,hour,calculatedAt:now,fee}};
  }
  function validate(input,existingZones){
    if(!input||!input.zones||typeof input.zones!=='object')throw Error('Informe a tabela completa.');
    const names=Object.keys(input.zones);
    if(names.length<1||names.length>100||Object.keys(existingZones).some(z=>!names.includes(z)))throw Error('Preserve todas as regiões cadastradas.');
    const amount=v=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>10000||Math.abs(v*100-Math.round(v*100))>0.000001)throw Error('Valores devem ter até duas casas decimais, entre 0 e 10.000.');return v;};
    const rates={schemaVersion:1,zones:{}};
    for(const name of names){if(!name||name.length>120||/[.#$\[\]/]/.test(name))throw Error('Região inválida.');rates.zones[name]=amount(input.zones[name]);}
    for(const field of ['sedeDay','sedeNight','rainSede','night','bag','bankService','cardMinimum','lateMinimum'])rates[field]=amount(input[field]);
    rates.zones[SEDE]=rates.sedeDay;
    return rates;
  }
  function notice(state,id,title,body,now,expiresAt){
    state.systemNotices||={};state.pushUpdates||={};
    if(state.systemNotices[id])return false;
    state.systemNotices[id]={title,body,createdAt:now,expiresAt};
    state.pushUpdates[id]={noticeId:id,title,body,action:'announcement',recipients:[...new Set([...Object.keys(state.profiles?.stores||{}),...Object.keys(state.profiles?.couriers||{})])],createdAt:now};
    return true;
  }
  function settle(original,now){
    const state=structuredClone(original||{});let changed=false;
    const current=latest(state.config?.tariffPlans,state.config?.tariffCancellations,now);
    const weather=latest(state.config?.rainPlans,{},now);
    if(current)changed=notice(state,'tariff_active_'+current[0],'Nova tabela de entregas em vigor','A tabela agendada já vale para novos pedidos. Pedidos registrados mantêm seus valores.',now,now+86400000)||changed;
    if(weather&&(!weather[1].enabled||current))changed=notice(state,'rain_active_'+weather[0],weather[1].enabled?'TAXA DIA DE CHUVA ATIVADA':'Taxa de chuva desativada','Somente novos pedidos da sede seguem esta condição. Pedidos registrados e outras regiões mantêm seus valores.',now,now+86400000)||changed;
    return changed?state:null;
  }
  return {SEDE,MIN_NOTICE,toInput,fromInput,latest,head,resolve,rain,price,validate,notice,settle};
});
