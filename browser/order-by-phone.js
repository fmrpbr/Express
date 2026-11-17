(function(){
  'use strict';
  // Shared by browser and Android. Lookup remains scoped to the signed-in store.
  window.createBrowserPhoneOrders=function(ctx){
    const {phoneKey,fingerprint}=window.ExpressPhoneCustomers;
    const form=document.getElementById('mobile-order-form'),phone=form.elements.phone;
    const owner=()=>ctx.owner();
    let enabled=false,sequence=0,timer,record=null,key=null,confirmed=null,lookupState='idle',sessionOwner=null;
    const originalPhoneParent=phone.parentElement.parentElement,originalNext=phone.parentElement.nextSibling;
    const fields={name:form.elements.client,street:form.elements.clientStreet,number:form.elements.clientNumber,neighborhood:form.elements.clientNeighborhood,reference:form.elements.clientReference,city:form.elements.city,zone:form.elements.selectedZone};
    const panel=document.createElement('section');panel.id='phone-customer-panel';panel.hidden=true;panel.className='info';panel.style.cssText='margin:0 0 12px;padding:14px;flex-shrink:0';
    panel.innerHTML='<p><b>Pedido por celular</b></p><p data-phone-status role="status" aria-live="polite"></p><p data-phone-summary style="white-space:pre-line;overflow-wrap:anywhere"></p><div class="buttons"><button type="button" class="btn primary tiny" data-phone-use>Usar este endereço</button><button type="button" class="btn secondary tiny" data-phone-edit>Editar endereço</button><button type="button" class="btn secondary tiny" data-phone-retry>Tentar consulta novamente</button><button type="button" class="btn primary tiny" data-phone-confirm>Confirmar dados e endereço</button></div><label data-phone-save-label style="display:block;margin-top:12px"><input type="checkbox" data-phone-save style="width:auto"> Atualizar o cadastro para os próximos pedidos</label><small data-phone-help></small>';
    const body=form.querySelector('.sheet-body');body.prepend(panel);
    const status=panel.querySelector('[data-phone-status]'),summary=panel.querySelector('[data-phone-summary]');
    const use=panel.querySelector('[data-phone-use]'),edit=panel.querySelector('[data-phone-edit]'),confirm=panel.querySelector('[data-phone-confirm]'),save=panel.querySelector('[data-phone-save]'),saveLabel=panel.querySelector('[data-phone-save-label]');
    const help=panel.querySelector('[data-phone-help]'),retry=panel.querySelector('[data-phone-retry]');
    retry.onclick=()=>lookup();
    const read=()=>Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value.trim()]));
    function setEditing(show){
      form.querySelector('.section-title').hidden=!show;
      for(const id of ['field-client','field-street','field-number','field-neighborhood','field-reference'])document.getElementById(id).hidden=!show;
    }
    function draw(){
      panel.hidden=!enabled;if(!enabled)return;
      summary.textContent=record?[record.name,record.street+', '+record.number+' • '+record.neighborhood,record.city,record.reference?'Referência: '+record.reference:''].filter(Boolean).join('\n'):'';
      use.hidden=!record||lookupState!=='found';edit.hidden=!record||lookupState!=='found';
      confirm.hidden=!['new','editing','confirmed'].includes(lookupState);
      confirm.textContent=confirmed?'Endereço confirmado ✓':'Confirmar dados e endereço';
      saveLabel.hidden=!(record&&lookupState==='editing');retry.hidden=lookupState!=='error';
      setEditing(lookupState!=='found'&&lookupState!=='confirmed');
      status.textContent=({idle:'Informe o celular com DDD para consultar os clientes da sua loja.',loading:'Consultando cadastro…',found:'Cliente encontrado. Confira o endereço antes de continuar.',new:'Cliente novo. Preencha os dados e confirme o endereço.',editing:'Confira os dados abaixo. Você pode alterar só esta entrega ou atualizar o cadastro.',confirmed:'Endereço confirmado para esta entrega.',error:'Não foi possível consultar o cadastro. Confira sua conexão e tente novamente.'})[lookupState];
      help.textContent=lookupState==='editing'?'Desmarcado: a mudança vale só nesta entrega.':'Os dados são salvos na conta da sua loja depois que o pedido é enviado.';
    }
    function cancel(){clearTimeout(timer);sequence++;enabled=false;record=null;confirmed=null;key=null;sessionOwner=null;setEditing(true);panel.hidden=true;phone.required=false;}
    function resetLookup(){record=null;confirmed=null;key=null;lookupState='idle';save.checked=false;draw();}
    async function lookup(){
      const candidate=phoneKey(phone.value);const uid=owner();
      if(!enabled||!uid||uid!==sessionOwner)return;
      const n=++sequence;resetLookup();
      if(!candidate){status.textContent='Informe um telefone válido com DDD.';return;}
      lookupState='loading';draw();
      try{
        const found=await ctx.lookup(uid,candidate);
        if(n!==sequence||!enabled||owner()!==uid||phoneKey(phone.value)!==candidate)return;
        key=candidate;record=found;lookupState=found?'found':'new';
        // A new number must never inherit the previous recipient's address.
        for(const [k,el]of Object.entries(fields))el.value=k==='city'?'ARACRUZ':'';
        if(found){for(const [k,el]of Object.entries(fields))el.value=found[k]||'';}
        ctx.recalculate();
        draw();
      }catch(error){if(n!==sequence||!enabled||owner()!==uid)return;lookupState='error';draw();}
    }
    phone.addEventListener('input',()=>{if(!enabled)return;sequence++;resetLookup();clearTimeout(timer);timer=setTimeout(lookup,300);});
    phone.addEventListener('blur',()=>{if(enabled&&lookupState==='idle'){clearTimeout(timer);lookup();}});
    for(const el of Object.values(fields))for(const event of ['input','change'])el.addEventListener(event,()=>{
      if(!enabled)return;confirmed=null;
      if(lookupState==='confirmed')lookupState=record?'editing':'new';
      draw();
    });
    function validateFields(){
      const data=read();
      if(!key||key!==phoneKey(phone.value)||!data.name||!data.street||!data.number||!data.neighborhood||!data.city){ctx.toast('Preencha nome, telefone com DDD, cidade e endereço completo.','warn');return false;}
      return true;
    }
    function accept(){if(!validateFields())return;confirmed=fingerprint(read());lookupState='confirmed';ctx.recalculate();draw();}
    use.onclick=accept;confirm.onclick=accept;
    edit.onclick=()=>{confirmed=null;lookupState='editing';save.checked=false;draw();fields.name.focus();};
    return {
      open(isQuote,editId){
        cancel();
        if(isQuote||!owner()){
          originalPhoneParent.insertBefore(phone.parentElement,originalNext);return;
        }
        enabled=true;sessionOwner=owner();phone.required=true;phone.type='tel';phone.inputMode='tel';
        body.insertBefore(phone.parentElement,panel);resetLookup();
        // Editing an order still requires confirmation; do not overwrite it with a saved address.
        if(editId){
          key=phoneKey(phone.value);lookupState='new';draw();
          const uid=sessionOwner,n=++sequence;
          if(key)ctx.lookup(uid,key).then(value=>{if(n===sequence&&enabled&&owner()===uid){record=value;lookupState=value?'editing':'new';draw();}}).catch(()=>{if(n===sequence){lookupState='error';draw();}});
        }else phone.focus();
      },
      close:cancel,
      validate(){
        if(!enabled)return true;
        if(owner()!==sessionOwner||!validateFields()||!['new','editing','confirmed'].includes(lookupState))return false;
        if(confirmed!==fingerprint(read())){ctx.toast('Confirme o endereço antes de enviar o pedido.','warn');return false;}
        return true;
      },
      snapshot(){return !enabled?null:{uid:sessionOwner,key,data:read(),revision:Number(record?.revision||0),save:!record||save.checked};},
      async saved(snapshot){
        if(!snapshot?.save)return true;
        try{await ctx.save(snapshot);return true;}catch(error){
          // The order already exists. Never resubmit it because directory synchronization failed.
          ctx.toast('Pedido enviado. O cadastro do cliente não foi atualizado. Confira o endereço novamente no próximo pedido.','warn');
          return false;
        }
      }
    };
  };
})();
