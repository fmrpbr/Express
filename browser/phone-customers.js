(function(root){
  'use strict';
  function phoneKey(value){
    let digits=String(value||'').replace(/\D/g,'');
    if((digits.length===12||digits.length===13)&&digits.startsWith('55'))digits=digits.slice(2);
    if(!/^[1-9]\d{9,10}$/.test(digits))return null;
    return '55'+digits;
  }
  const fields=['name','street','number','neighborhood','reference','city','zone'];
  function fingerprint(value){return JSON.stringify(fields.map(k=>String(value[k]||'').trim()));}
  const api={phoneKey,fingerprint,fields};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.ExpressPhoneCustomers=api;
})(typeof window==='undefined'?globalThis:window);
