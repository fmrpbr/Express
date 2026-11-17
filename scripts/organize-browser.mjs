// Applied only to browser-dist; original APK source remains unchanged.
export function organizeBrowser(source){
  let html=source;
  function replace(from,to){if(!html.includes(from))throw Error('Organização do navegador: trecho não encontrado: '+from.slice(0,90));html=html.replace(from,to);}
  replace('<script src="./phone-customers.js"></script>','<script src="./phone-customers.js"></script>\n<script src="./notice-policy.js"></script>');
  replace("systemNotices=Object.values(snap.val()||{});render();","systemNotices=Object.entries(snap.val()||{}).map(([id,n])=>({...n,id}));render();");
  replace("    const notices=systemNotices.filter(n=>n.expiresAt>Date.now()).sort((a,b)=>b.createdAt-a.createdAt).slice(0,3);","    const browserNotices=window.ExpressBrowserNotices.select(systemNotices,serverNow());\n    const notices=view==='dashboard'&&browserNotices.spotlight?[browserNotices.spotlight]:[];");
  replace("'<div class=\"info\" role=\"status\"><b>'+esc(n.title)+'</b><p>'+esc(n.body)+'</p></div>'","'<div class=\"info browser-spotlight\" data-browser-notice role=\"status\"><b>'+esc(n.title)+'</b><p>'+esc(n.body)+'</p><small>Depois, consulte na barra de avisos ou no histórico.</small></div>'");
  replace("    const tariffBanner=rainNotice+(weather.enabled?'<div class=\"info\"><b>TAXA DIA DE CHUVA ATIVADA</b><p>Somente novos pedidos da sede. Consulte os valores em Tarifas.</p></div>':'')+noticeHtml;","    const tariffBanner=rainNotice+noticeHtml;");
  const quickLine=html.split('\n').find(line=>line.includes('const quickActions ='));
  if(!quickLine)throw Error('Atalhos não encontrados.');
  replace(quickLine,quickLine.replace('<section class="quick-controls" aria-label="Minha operação"><div class="quick-heading"><b>Minha operação</b><small>Preferências e informações</small></div>','<details class="quick-controls browser-preferences" data-browser-preferences><summary>⚙ Preferências e informações</summary>').replace('</div></section>','</div></details>'));
  replace('    const review = window.ExpressPayments.summary(mine());','    const preferencesOpen=document.querySelector("[data-browser-preferences]")?.open===true;\n    const review = window.ExpressPayments.summary(mine());');
  replace('availabilityPanel + quickActions + tariffBanner + paymentNotice + overdueNotice + show();','availabilityPanel + tariffBanner + paymentNotice + overdueNotice + show() + quickActions;\n    if(preferencesOpen&&document.querySelector("[data-browser-preferences]"))document.querySelector("[data-browser-preferences]").open=true;');
  const start=html.indexOf('      const alerts = activeAlerts().slice(0, 6).reverse();');
  const end=html.indexOf('\n    }\n  }\n\n  document.getElementById("auth-form")',start);
  const oldTicker=html.slice(start,end);
  if(start<0||end<0||!oldTicker.includes('messages + messages'))throw Error('Faixa de avisos não encontrada.');
  replace(oldTicker,[
    '      const notices=window.ExpressBrowserNotices.select(systemNotices,serverNow());',
    '      const messages=[...activeAlerts().slice(0,6).reverse().map(a=>(a.senderRole==="courier"?"MOTOBOY":"LOJISTA")+" • "+a.message),...notices.ticker.map(n=>"SISTEMA • "+n.title+" · "+n.body)];',
    '      const spans=messages.length?messages.map(message=>"<span>"+esc(message)+"</span>").join(""):"<span>SEM AVISOS NO MOMENTO</span>";',
    '      const signature=JSON.stringify(messages);',
    '      if(track.dataset.messages!==signature||track.dataset.rendered!==track.innerHTML){track.dataset.messages=signature;track.innerHTML=spans+spans;track.dataset.rendered=track.innerHTML;}'
  ].join('\n'));
  // Only refresh the notice area on the timer; do not rerender an edited form.
  replace('    updateHeroClock();\n    if (!heroClockTimer)',[
    '    updateHeroClock();',
    '    if (!window.__browserNoticeTimer)window.__browserNoticeTimer=setInterval(()=>{',
    '      if(!currentUser||!accountAllowed())return;',
    '      renderHero();',
    '      const current=window.ExpressBrowserNotices.select(systemNotices,serverNow()).spotlight;',
    '      for(const node of document.querySelectorAll("[data-browser-notice]")){',
    '        const title=node.querySelector("b")?.textContent;',
    '        if(!current||current.title!==title)node.remove();',
    '      }',
    '    },1000);',
    '    if (!heroClockTimer)'
  ].join('\n'));
  const oldSection=html.split('\n').find(l=>l.includes('const section=(title,list,emptyTitle,emptyText)=>'));
  if(!oldSection)throw Error('Seções da visão geral não encontradas.');
  replace(oldSection,oldSection.replace("=>'<section","=>!list.length?'':'<section"));
  replace('const recent=os.filter(o=>!["awaiting_return","awaiting_quote_return","route_draft"].includes(o.status))','const recent=os.filter(o=>["done","cancelled","cancelado_cotacao","route_done","route_cancelled"].includes(o.status))');
  replace('    const alerts = activeAlerts();\n    const history=',[
    '    const alerts = activeAlerts();',
    '    const selectedNotices=window.ExpressBrowserNotices.select(systemNotices,serverNow());',
    '    const systemHistory=\'<details class="panel browser-notice-history" data-browser-notice-history><summary>Histórico de avisos do sistema (\'+selectedNotices.history.length+\')</summary>\'+selectedNotices.history.slice(0,100).map(n=>\'<article class="registry-entry"><b>\'+esc(n.title)+\'</b><p>\'+esc(n.body)+\'</p><small>\'+date(n.createdAt)+\' · \'+(selectedNotices.spotlight===n?\'Em destaque\':selectedNotices.ticker.includes(n)?\'Na barra de avisos\':\'Substituído ou encerrado\')+\'</small></article>\').join(\'\')+\'</details>\';',
    '    const history='
  ].join('\n'));
  replace("(canSend ? '<form id=\"alert-form\"","systemHistory + (canSend ? '<form id=\"alert-form\"");
  replace('</head>','<style>.browser-preferences{margin-top:18px}.browser-preferences summary,.browser-notice-history summary{cursor:pointer;font-weight:800;padding:6px 0}.browser-preferences .quick-grid{margin-top:12px}.browser-spotlight{padding:12px 14px;margin-bottom:12px}.browser-spotlight p{margin:6px 0}.browser-spotlight small{font-size:11px}.browser-notice-history{margin:14px 0}.browser-notice-history .registry-entry{margin-top:12px}</style></head>');
  return html;
}
