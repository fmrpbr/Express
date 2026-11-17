(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExpressBrowserNotices=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SPOTLIGHT=3*60*1000, LIFETIME=4*60*60*1000;
  function topic(n){
    if(n.topic)return String(n.topic);
    const id=String(n.id||'');
    if(/^rain_(active|scheduled|cancel)_/.test(id))return 'rain';
    if(/^tariff_(active|scheduled|cancel)_/.test(id))return 'tariff';
    const title=String(n.title||'').toLocaleLowerCase('pt-BR');
    if(title.includes('chuva'))return 'rain';
    if(/tabela|tarifa|valores de entrega/.test(title))return 'tariff';
    return id||title;
  }
  const stamp=n=>Number(n.createdAt)||0;
  const sorted=items=>items.slice().sort((a,b)=>stamp(b)-stamp(a)||String(b.id||'').localeCompare(String(a.id||'')));
  function select(items,now=Date.now()){
    const latest=new Map();
    // Select before filtering expiry: an older announcement must never return.
    for(const n of sorted(items||[])){
      if(!Number.isFinite(Number(n.createdAt))||stamp(n)<=0||stamp(n)>now)continue;
      const key=topic(n);if(!latest.has(key))latest.set(key,n);
    }
    const visible=sorted([...latest.values()]).filter(n=>{
      const scheduled=/_scheduled_/.test(n.id||'');
      const expiry=Number(n.expiresAt);
      return Number.isFinite(expiry)&&expiry>now&&(scheduled||now-stamp(n)<LIFETIME);
    });
    const spotlight=visible.find(n=>now-stamp(n)<SPOTLIGHT)||null;
    return {spotlight,ticker:visible.filter(n=>n!==spotlight),history:sorted(items||[])};
  }
  return {SPOTLIGHT,LIFETIME,topic,select};
});