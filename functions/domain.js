"use strict";

const FIVE_MINUTES = 300000;
const { paymentState, normalizePix } = require("./payments");
const Tariffs = require("./tariffs");
const Logistics = require("./logistics");
class DomainError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (condition, message, code = "failed-precondition") => {
  if (!condition) throw new DomainError(code, message);
};
function key(value, label = "Identificador") {
  fail(typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value), `${label} inválido.`, "invalid-argument");
  return value;
}
function text(value, max = 160, required = false) {
  fail(typeof value === "string" && value.length <= max && (!required || value.trim().length > 0), "Texto inválido.", "invalid-argument");
  return value.trim().toLocaleUpperCase("pt-BR");
}
const money = value => {
  const amount = value;
  fail(typeof amount === "number" && Number.isFinite(amount) && Math.round(amount * 100) >= 1 && amount <= 10000, "Valor inválido.", "invalid-argument");
  return Math.round(amount * 100) / 100;
};
function profile(state, uid) {
  if (state.profiles?.stores?.[uid]) return { ...state.profiles.stores[uid], role: "store" };
  if (state.profiles?.couriers?.[uid]) return { ...state.profiles.couriers[uid], role: "courier" };
  return null;
}
function put(state, path, value) {
  const parts = path.split("/");
  const leaf = parts.pop();
  let node = state;
  for (const part of parts) node = node[part] ||= {};
  if (value === null) delete node[leaf]; else node[leaf] = value;
}
const accessAllowed = entry => !!entry && (!entry.accessStatus || entry.accessStatus === "approved");
function publicOrder(order) {
  const result = {};
  for (const field of ["orderCode", "status", "serviceType", "serviceDate", "city", "clientNeighborhood", "neighborhood", "selectedZone", "fee", "created", "updatedAt", "revision", "fragile", "importantNotes", "kind", "deliveryCount", "completedStops", "routeValues", "priorityUntil", "roundtripSchema", "legNumber", "roundtripTotalFee", "offerCreatedAt"])
    if (order[field] !== undefined) result[field] = order[field];
  return result;
}
function eligibleOrder(order, now) {
  return !!order && ["open", "cotacao", "route_open", "return_priority"].includes(order.status) && (!order.expiresAt || order.expiresAt > now);
}
const COURIER_CAPACITY = 2;
function courierSlots(state, uid, excludeId) {
  return Object.entries(state.orders || {}).filter(([id, o]) => id !== excludeId &&
    !o.routeId && o.courierId === uid && (o.status === "run" || o.status === "cotacao_aceita" || (o.status === "open" && o.assignedCourierId === uid)));
}
function courierLoad(state,uid,excludeId){return courierSlots(state,uid,excludeId).reduce((sum,[,o])=>sum+(o.kind==='route'?COURIER_CAPACITY:1),0);}
function canTakeOrder(state,uid,order,excludeId){const load=courierLoad(state,uid,excludeId);return state.courierPresence?.[uid]?.availableForWork===true&&(order?.kind==='route'?load===0:load<COURIER_CAPACITY);}
function offerAllowed(order,uid,now){return order?.status!=='return_priority'||order.priorityUntil<=now||order.priorityCourierId===uid;}
function syncTracking(state, order, now) {
  if (!order.trackingToken) return;
  const active = ["open", "run"].includes(order.status) && order.trackingExpiresAt > now;
  put(state, `publicTracking/${order.trackingToken}`, active ? {
    orderCode: order.orderCode, status: order.status,
    serviceTypeLabel: order.serviceType === "roundtrip" ? "Recolha e entrega" : order.serviceType === "collection" ? "Recolha" : order.kind==='route'?"Rota múltipla":"Entrega",
    queuePosition: order.status === "run" ? Number(order.queuePosition || 1) : 0,
    location: order.status === "run" ? order.location || null : null,
    updatedAt: now, expiresAt: order.trackingExpiresAt, revoked: false
  } : null);
}
function syncCourierWork(state, uid, now) {
  const slots = courierSlots(state, uid);
  const running = slots.filter(([, o]) => o.status === "run").sort((a, b) => Number(a[1].accepted || 0) - Number(b[1].accepted || 0) || a[0].localeCompare(b[0]));
  let focus = state.courierFocus?.[uid];
  if (!running.some(([id]) => id === focus)) focus = running[0]?.[0] || null;
  put(state, `courierFocus/${uid}`, focus);
  running.sort((a, b) => (a[0] === focus ? -1 : b[0] === focus ? 1 : 0));
  running.forEach(([id, order], index) => {
    const position = index + 1;
    const latest = state.courierLocations?.[uid];
    const newLocation = latest && latest.updatedAt > Number(order.location?.updatedAt || 0);
    if (order.queuePosition !== position || newLocation) {
      order.queuePosition = position;
      if (newLocation) order.location = { ...latest };
      order.revision = Number(order.revision || 0) + 1;
      order.updatedAt = now;
    }
    put(state, `storeOrders/${order.storeId}/${id}`, order);
    put(state, `courierOrders/${uid}/${id}`, order);
    syncTracking(state, order, now);
    if(order.kind==='route')for(const stopId of order.routeOrderIds||[]){const stop=state.orders?.[stopId];if(stop?.status!=='run')continue;const childLocation=latest&&latest.updatedAt>Number(stop.location?.updatedAt||0);if(childLocation||stop.queuePosition!==position){stop.queuePosition=position;if(childLocation)stop.location={...latest};stop.revision=Number(stop.revision||0)+1;stop.updatedAt=now;put(state,`storeOrders/${stop.storeId}/${stopId}`,stop);put(state,`courierOrders/${uid}/${stopId}`,stop);syncTracking(state,stop,now);}}
  });
  const presence = state.courierPresence?.[uid];
  if (presence) Object.assign(presence, { busy: running.length > 0, activeCount: running.length, occupiedSlots: courierLoad(state,uid), routeActive:running.some(([,o])=>o.kind==='route'), capacity: COURIER_CAPACITY });
  if (!running.length) put(state, `courierLocations/${uid}`, null);
}
function queueJob(state, id, order, now) {
  const path = `pushJobs/${id}`;
  if (!eligibleOrder(order, now)) { put(state, path, null); return; }
  const kind = order.status === "cotacao" ? "quote" : "order";
  const old = state.pushJobs?.[id];
  if (old?.kind === kind && old.generation === order.offerGeneration) return;
  put(state, path, { orderId: id, kind, generation: order.offerGeneration, createdAt: now, nextAt: now, slot: 0 });
}
function projectOrder(state, id, order, previous, now) {
  put(state, `orders/${id}`, order);
  put(state, `storeOrders/${order.storeId}/${id}`, order);
  if (previous?.courierId && previous.courierId !== order.courierId)
    put(state, `courierOrders/${previous.courierId}/${id}`, null);
  if (order.courierId) put(state, `courierOrders/${order.courierId}/${id}`, order);
  put(state, `availableOrders/${id}`, ["open","route_open","return_priority"].includes(order.status) && !order.assignedCourierId ? publicOrder(order) : null);
  for(const target of new Set([previous?.priorityCourierId,order.priorityCourierId].filter(Boolean)))put(state,`courierOffers/${target}/${id}`,order.status==='return_priority'&&target===order.priorityCourierId?{...publicOrder(order),isPriorityOffer:true}:null);
  put(state, `quoteBoard/${id}`, order.status === "cotacao" ? publicOrder(order) : null);
  if (previous?.trackingToken && previous.trackingToken !== order.trackingToken)
    put(state, `publicTracking/${previous.trackingToken}`, null);
  syncTracking(state, order, now);
  for (const uid of new Set([previous?.courierId, order.courierId].filter(Boolean))) {
    syncCourierWork(state, uid, now);
  }
  queueJob(state, id, order, now);
}
function commitOrder(state,id,order,previous,now,actor,action,requestId){
 order.revision=Number(order.revision||0)+1;order.updatedAt=now;order.lastActorUid=actor;
 projectOrder(state,id,order,previous,now);
 put(state,`orderEvents/${id}/${actor}_${requestId}`,{action,actorUid:actor,at:now,revision:order.revision});
 const recipients=[...new Set([order.storeId,order.courierId,previous?.courierId].filter(x=>x&&x!==actor))];
 if(recipients.length&&(!order.routeId||action==='finish')&&action!=='finishRouteStop')put(state,`pushUpdates/${id}_${order.revision}`,{orderId:id,action,status:order.status,recipients,createdAt:now});
}
const logisticsApi={fail,key,put,commit:commitOrder,projectOrder,courierSlots};
function settleReturns(original,now){const state=structuredClone(original||{});return Logistics.expireReturns(state,now,logisticsApi)?state:null;}
const defaultRates = require("./default-rates.json");
function orderInput(input, quote) {
  fail(input && typeof input === "object", "Pedido inválido.", "invalid-argument");
  fail(["delivery", "collection", "roundtrip"].includes(input.serviceType), "Tipo de serviço inválido.");
  fail(/^\d{4}-\d{2}-\d{2}$/.test(input.serviceDate || "") && !Number.isNaN(Date.parse(input.serviceDate)) && new Date(input.serviceDate).toISOString().slice(0, 10) === input.serviceDate, "Data inválida.");
  const result = { serviceType: input.serviceType, serviceDate: input.serviceDate, bag: !quote && input.bag === true, bank: !quote && input.bank === true };
  for (const field of ["city", "clientNeighborhood"]) result[field] = text(input[field], 120, true);
  for (const field of ["client", "phone", "clientStreet", "clientNumber", "clientReference", "notes"])
    result[field] = quote ? "" : text(input[field] || "", field === "notes" ? 500 : 160, ["client", "clientStreet", "clientNumber"].includes(field));
  result.fragile = !quote && input.fragile === true;
  result.importantNotes = !quote && input.importantNotes === true;
  fail(!result.importantNotes || result.notes.length > 0, "Preencha a observação importante.");
  result.selectedZone = String(input.selectedZone || "");
  fail(result.selectedZone.length <= 120, "Zona inválida.");
  result.paymentMethod = quote ? "" : String(input.paymentMethod || "");
  fail(result.paymentMethod.length <= 40, "Pagamento inválido.");
  result.neighborhood = result.clientNeighborhood;
  result.address = quote ? `${result.city} - ${result.clientNeighborhood}` : `${result.clientStreet}, nº ${result.clientNumber} - ${result.clientNeighborhood}`;
  return result;
}

// O callback é puro: IDs, tempo e aleatoriedade são gerados uma vez fora da transação.
function applyCommand(original, auth, command, context) {
  fail(auth?.uid, "Entre na sua conta.", "unauthenticated");
  const uid = key(auth.uid, "Usuário");
  const requestId = key(command.requestId, "Operação");
  const action = command.action;
  let eventAction = action;
  const input = command.input || {};
  const { now, newId, token } = context;
  const state = structuredClone(original || {});
  const who = profile(state, uid);
  if (action !== "createProfile" && auth.token?.admin !== true) fail(accessAllowed(who), who ? "Acesso pendente, reprovado ou bloqueado. Aguarde o administrador." : "Perfil não encontrado.", "permission-denied");
  const receipt = state.operationReceipts?.[uid]?.[requestId];
  if (receipt) {
    fail(receipt.fingerprint === context.fingerprint, "Identificador reutilizado com outros dados.", "already-exists");
    return { state, result: receipt.result };
  }
  Logistics.expireReturns(state,now,logisticsApi);
  const logisticsContext={...context,uid,requestId};
  let result = { ok: true };
  let id = command.orderId ? key(command.orderId, "Pedido") : null;
  let order = id ? state.orders?.[id] : null;
  const previous = order ? structuredClone(order) : null;
  const store = () => fail(who?.role === "store" && order?.storeId === uid, "Pedido de outra loja.", "permission-denied");
  const courier = () => fail(who?.role === "courier" && order?.courierId === uid, "Corrida de outro motoboy.", "permission-denied");
  const available = () => fail(who?.role === "courier" && canTakeOrder(state,uid,order,id), "Ative sua disponibilidade. Limite de duas corridas aceitas ou reservadas.");
  if(Logistics.handles(action))result=Logistics.dispatch(state,uid,who,action,id,input,logisticsContext,logisticsApi);
  else if (action === "createProfile") {
    fail(!who, "Esta conta já possui perfil.");
    fail(["store", "courier"].includes(input.role), "Perfil inválido.");
    const entry = { name: text(input.name, 80, true), phone: text(input.phone, 30, true), email: String(auth.token?.email || ""), address: "", created: now, accessStatus: "pending" };
    fail(entry.phone.replace(/\D/g, "").length >= 10, "Telefone inválido.");
    put(state, `profiles/${input.role === "store" ? "stores" : "couriers"}/${uid}`, entry);
    if (input.role === "courier") put(state, `courierPresence/${uid}`, { registered: true, online: false, busy: false, availableForWork: false, lastSeen: now });
  } else if (action === "setAccountAccess") {
    fail(auth.token?.admin === true, "Acesso administrativo necessário.", "permission-denied");
    const target = key(input.uid);
    fail(["store", "courier"].includes(input.role) && ["approved", "rejected", "blocked"].includes(input.status), "Situação inválida.");
    fail(target !== uid, "Não é possível alterar o próprio acesso administrativo.");
    const path = `profiles/${input.role === "store" ? "stores" : "couriers"}/${target}`;
    const entry = profile(state, target);
    fail(entry?.role === input.role, "Cadastro não encontrado.", "not-found");
    fail((entry.accessStatus || "approved") === input.expectedStatus, "Cadastro alterado. Confira a situação atual antes de tentar novamente.");
    const reason = text(input.reason || "", 300);
    fail(input.status === "approved" || reason.length > 0, "Informe o motivo.");
    put(state, path, {...entry, role: undefined, accessStatus: input.status, accessReason: reason, accessUpdatedAt: now, accessUpdatedBy: uid});
    delete state.profiles[input.role === "store" ? "stores" : "couriers"][target].role;
    if (input.status !== "approved" && input.role === "courier") {
      if(state.courierPresence?.[target]) state.courierPresence[target].availableForWork = false;
      put(state, `courierConnections/${target}`, null);
    }
    put(state, `adminEvents/${uid}_${requestId}`, {action, actorUid: uid, targetUid: target, targetRole: input.role, previousStatus: entry.accessStatus || "approved", status: input.status, reason, at: now});
  } else if (action === "cancelAlert") {
    const alertId = key(input.alertId, "Alerta");
    const alert = state.alerts?.[alertId];
    fail(alert, "Alerta não encontrado.", "not-found");
    fail(alert.senderId === uid || auth.token?.admin === true, "Somente o autor ou administrador pode cancelar.", "permission-denied");
    fail(alert.expiresAt > now && !alert.cancelledAt, "Este alerta já foi cancelado ou expirou.");
    Object.assign(alert, {status: "cancelled", cancelledAt: now, cancelledBy: uid});
    put(state, `pushUpdates/alert_${alertId}`, null);
    put(state, `adminEvents/${uid}_${requestId}`, {action, actorUid: uid, alertId, at: now});
  } else if (action === "previewOrderCare") {
    available();
    fail(["open","route_open","return_priority"].includes(order?.status)&&offerAllowed(order,uid,now)&&(!order.assignedCourierId||order.assignedCourierId===uid),"Pedido indisponível.");
    result.care=Logistics.careFor(state,order);
  } else if (action === "saveProfile") {
    fail(who, "Perfil não encontrado.", "permission-denied");
    const entry = { ...state.profiles[who.role === "store" ? "stores" : "couriers"][uid], name: text(input.name, 80, true), phone: text(input.phone, 30, true), address: text(input.address, 300, true) };
    fail(entry.phone.replace(/\D/g, "").length >= 10, "Telefone inválido.");
    put(state, `profiles/${who.role === "store" ? "stores" : "couriers"}/${uid}`, entry);
  } else if (action === "savePix") {
    fail(who?.role === "courier", "Somente o motoboy altera sua chave Pix.", "permission-denied");
    let pix;
    try { pix = { ...normalizePix(input), updatedAt: now }; }
    catch (error) { throw new DomainError("invalid-argument", error.message); }
    put(state, `profiles/couriers/${uid}/pix`, pix);
    // A chave usada em pagamento informado ou confirmado fica preservada no pedido.
    for (const [orderId, done] of Object.entries(state.orders || {})) {
      if (done.courierId !== uid || done.status !== "done" || paymentState(done) !== "pending") continue;
      const before = structuredClone(done);
      done.paymentPix = { ...pix };
      done.revision = Number(done.revision || 0) + 1;
      done.updatedAt = now;
      projectOrder(state, orderId, done, before, now);
    }
  } else if (action === "registerDevice") {
    fail(who?.role === "store" || who?.role === "courier" || auth.token?.admin===true, "Perfil não encontrado.", "permission-denied");
    fail(typeof input.token === "string" && input.token.length >= 20 && input.token.length <= 4096, "Token inválido.");
    put(state,`notificationAccounts/${uid}`,{role:auth.token?.admin===true?'admin':who.role,updatedAt:now});
    const deviceId = key(input.deviceId, "Aparelho");
    const tokenId = require("node:crypto").createHash("sha256").update(input.token).digest("hex");
    // O mesmo aparelho/token fica ligado somente à conta autenticada atual.
    for (const [owner, entries] of Object.entries(state.fcmTokens || {})) {
      for (const [entryId, entry] of Object.entries(entries)) {
        if (entry.token === input.token || entry.deviceId === deviceId) put(state, `fcmTokens/${owner}/${entryId}`, null);
      }
    }
    const soundSchema = require('./notification-policy').SCHEMA;
    const notificationSchema = input.notificationSchema === soundSchema ? soundSchema : 'legacy';
    const offerSound = who?.role === 'courier' && notificationSchema === soundSchema && input.offerSound === true;
    put(state, `fcmTokens/${uid}/${tokenId}`, { token: input.token, deviceId, platform: "android", notificationSchema,
      ...(offerSound ? { offerSound } : {}), updatedAt: now });
    result.notificationSchema=notificationSchema;
  } else if(action==='registerWebDevice') {
    fail(who?.role==='store'||who?.role==='courier'||auth.token?.admin===true,'Perfil não encontrado.','permission-denied');
    put(state,`notificationAccounts/${uid}`,{role:auth.token?.admin===true?'admin':who.role,updatedAt:now});
    fail(typeof input.endpoint==='string'&&input.endpoint.length<=2048&&require('./notification-policy').validWebEndpoint(input.endpoint),'Endereço de notificações inválido.');
    fail(input.keys&&['p256dh','auth'].every(k=>typeof input.keys[k]==='string'&&/^[A-Za-z0-9_-]{8,256}=?=?$/.test(input.keys[k])),'Chaves de inscrição inválidas.');
    const deviceId=key(input.deviceId,'Navegador');
    const subscriptionId=require('node:crypto').createHash('sha256').update(input.endpoint).digest('hex');
    for(const [owner,entries]of Object.entries(state.pushSubscriptions||{}))for(const [entryId,entry]of Object.entries(entries))if(entry.endpoint===input.endpoint||entry.deviceId===deviceId)put(state,`pushSubscriptions/${owner}/${entryId}`,null);
    put(state,`pushSubscriptions/${uid}/${subscriptionId}`,{endpoint:input.endpoint,keys:{p256dh:input.keys.p256dh,auth:input.keys.auth},deviceId,updatedAt:now});
    result.subscriptionId=subscriptionId;
  } else if (["saveRates", "scheduleRates", "cancelRates", "scheduleRain"].includes(action)) {
    fail(auth.token?.admin === true, "Acesso administrativo necessário.", "permission-denied");
    if(action === "cancelRates") {
      const planId=key(input.planId);const plan=state.config?.tariffPlans?.[planId];
      fail(plan && plan.effectiveAt>now && !state.config?.tariffCancellations?.[planId], "Somente um agendamento futuro pode ser cancelado.");
      put(state, `config/tariffCancellations/${planId}`, { at:now, actorUid:uid });
      if(state.systemNotices?.['tariff_scheduled_'+planId])state.systemNotices['tariff_scheduled_'+planId].expiresAt=now;
      Tariffs.notice(state,'tariff_cancel_'+planId,'Alteração de tarifas cancelada','O agendamento foi cancelado. Pedidos já registrados mantêm seus valores.',now,now+86400000);
    } else {
      fail(Number.isSafeInteger(input.effectiveAt)&&input.effectiveAt>=now+Tariffs.MIN_NOTICE,"Agende com pelo menos um minuto de antecedência.");
      if(action === "scheduleRain") {
        fail(typeof input.enabled==='boolean',"Informe a condição de chuva.");
        fail(!input.enabled||Tariffs.resolve(state.config,input.effectiveAt,defaultRates).schemaVersion===1,'Agende primeiro a tabela com o adicional de chuva da sede.');
        fail(!Object.values(state.config?.rainPlans||{}).some(p=>p.effectiveAt===input.effectiveAt),'Já existe mudança de chuva nesse horário.');
        put(state,`config/rainPlans/${newId}`,{enabled:input.enabled,effectiveAt:input.effectiveAt,createdAt:now,createdBy:uid});
        Tariffs.notice(state,'rain_scheduled_'+newId,'Mudança de chuva agendada',`A taxa de chuva será ${input.enabled?'ativada':'desativada'} na sede em ${new Date(input.effectiveAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}. Somente novos pedidos.`,now,input.effectiveAt);
      } else {
        fail(input.baseVersion===Tariffs.head(state.config?.tariffPlans),'A tabela foi atualizada por outro acesso. Reabra Tarifas antes de agendar.');
        fail(!Object.entries(state.config?.tariffPlans||{}).some(([k,p])=>!state.config?.tariffCancellations?.[k]&&p.effectiveAt===input.effectiveAt),'Já existe alteração nesse horário.');
        let rates;try { rates=Tariffs.validate(input.rates,{...defaultRates.zones,...state.config?.rates?.zones}); } catch(error){throw new DomainError('invalid-argument',error.message);}
        put(state,`config/tariffPlans/${newId}`,{rates,effectiveAt:input.effectiveAt,createdAt:now,createdBy:uid});
        Tariffs.notice(state,'tariff_scheduled_'+newId,'Novos valores de entrega agendados',`Consulte Tarifas: novos valores a partir de ${new Date(input.effectiveAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}. Pedidos registrados não serão alterados.`,now,input.effectiveAt);
      }
    }
    put(state,`adminEvents/${uid}_${requestId}`,{action,actorUid:uid,at:now});
  } else if (action === "signalRain") {
    fail(who?.role==='courier','Somente motoboys podem sinalizar chuva.','permission-denied');
    fail(!state.rainSignals?.[uid]||now-state.rainSignals[uid].at>=300000,'Seu sinal já foi registrado. Aguarde cinco minutos.');
    put(state,`rainSignals/${uid}`,{at:now,region:Tariffs.SEDE});
    const count=Object.values(state.rainSignals||{}).filter(s=>now-s.at<1800000).length;
    put(state,'config/rainSummary',{count,updatedAt:now});
    if(count>=2){
      const recipients=Object.entries(state.notificationAccounts||{}).filter(([,a])=>a.role==='admin').map(([id])=>id);
      const noticeId='rain_signal_'+Math.floor(now/1800000);
      if(recipients.length&&!state.pushUpdates?.[noticeId])put(state,`pushUpdates/${noticeId}`,{action:'rain-signal',recipients,createdAt:now,expiresAt:now+1800000});
    }
  } else {
    fail(who || auth.token?.admin === true, "Perfil não encontrado.", "permission-denied");
    if (action === "saveOrder") {
      fail(who?.role === "store", "Somente lojistas criam pedidos.", "permission-denied");
      if (id) { fail(order, "Pedido não encontrado.", "not-found"); store(); fail(["open", "cotacao", "cotacao_aceita","route_draft"].includes(order.status)&&!order.routeId&&order.kind!=="route", "Pedido não pode ser editado nesta etapa."); }
      const completing = order?.status === "cotacao_aceita";
      const quote = completing ? false : input.isQuote === true;
      if (order && !completing) fail(quote === (order.status === "cotacao"), "Não é possível trocar o modo do pedido.");
      const fields = orderInput(input, quote);
      if(previous&&!completing)fail(fields.serviceType===(previous.roundtripSchema&&previous.legNumber===1?'roundtrip':previous.serviceType),'Para alterar a modalidade, cancele e crie outro pedido.');
      if(input.routeDraft===true)fail(!quote&&fields.serviceType==='delivery','Rascunhos de rota devem ser entregas simples.');
      if(previous && !quote && !completing) {
        for(const field of ['selectedZone','paymentMethod','bag','bank']) fail((previous[field]||(field==='selectedZone'?Tariffs.SEDE:false))===(fields[field]||(field==='selectedZone'?Tariffs.SEDE:false)),'Para alterar região ou adicionais, cancele e crie um novo pedido. O valor registrado é preservado.');
      }
      fail(quote || who.address, "Cadastre o endereço da loja.");
      id ||= newId;
      order ||= { orderCode: `${quote ? "COT" : "EXP"}-${id.slice(-8).toUpperCase()}`, storeId: uid, created: now, createdBy: uid, paid: false, revision: 0, schemaVersion: 2, offerGeneration: 0 };
      Object.assign(order, fields, { storeName: who.name, storeAddress: who.address, status: quote ? "cotacao" : "open" });
      if(completing || order.agreedFee) order.fee=order.agreedFee;
      else if(quote) order.fee=0;
      else if(!previous) {
        let priced;try{priced=Tariffs.price(fields,Tariffs.resolve(state.config,now,defaultRates),Tariffs.rain(state.config,now),now);}catch(error){throw new DomainError('invalid-argument',error.message);}
        order.fee=priced.fee;order.priceSnapshot=priced.snapshot;order.rain=priced.snapshot.rainFee>0;
      }
      if(!quote){
        Logistics.linkRoundtrip(state,id,order,previous,completing,logisticsContext,logisticsApi);
        if(input.routeDraft===true||previous?.status==='route_draft')order.status='route_draft';
      }
      if (quote) { order.bids = {}; for (const courierUid of Object.keys(previous?.bids || {})) put(state, `courierBids/${courierUid}/${id}`, null); }
      if (!previous || previous.status !== order.status) order.offerGeneration += 1;
    } else {
      fail(order, "Pedido não encontrado.", "not-found");
      if(order.routeId)fail(["report-payment","confirm-payment","toggle-pay","tracking"].includes(action),'Gerencie esta entrega pelos controles da rota.');
      if(order.kind==='route')fail(["accept","focus","location","tracking"].includes(action),'Use os controles da rota múltipla.');
      if (action === "send-bid") {
        available(); fail(order.status === "cotacao", "Cotação encerrada.");
        const bid = { amount: money(input.amount), courierName: who.name, timestamp: now };
        order.bids ||= {}; order.bids[uid] = bid;
        put(state, `courierBids/${uid}/${id}`, bid);
      } else if (action === "accept-bid") {
        store(); fail(order.status === "cotacao", "Cotação já aceita ou encerrada.");
        const selected = key(input.courierId);
        const bid = order.bids?.[selected]; fail(bid && Number(input.amount) === bid.amount, "Proposta alterada ou inválida.");
        fail(accessAllowed(state.profiles?.couriers?.[selected]) && canTakeOrder(state,selected,order,id), "Motoboy indisponível: limite de duas corridas aceitas ou reservadas.");
        Object.assign(order, { status: "cotacao_aceita", courierId: selected, assignedCourierId: selected, courierName: bid.courierName, fee: bid.amount, agreedFee: bid.amount, quoteAcceptedAt: now });
      } else if (action === "accept") {
        available(); fail(["open","route_open","return_priority"].includes(order.status)&&offerAllowed(order,uid,now)&&(!order.assignedCourierId||order.assignedCourierId===uid), "Corrida já aceita, reservada ou em prioridade para outro motoboy.");
        const care=Logistics.careFor(state,order);
        if (care.fragile || care.importantNotes) {
          fail(input.careAcknowledged === true && input.careRevision === Number(order.revision || 0), "Leia e confirme os cuidados atualizados antes de aceitar.");
          order.careAcknowledgedAt = now; order.careAcknowledgedBy = uid;
        }
        Object.assign(order, { status: "run", courierId: uid, courierName: who.name, accepted: now, tripStage: 0 });
        if(order.kind==='route')Logistics.acceptRoute(state,id,order,who,uid,now,{...input,requestId},logisticsApi);
        if(order.legNumber===2)put(state,'returnTimers/'+id,null);
        // Aceite nunca modifica o valor registrado, inclusive em APK antigo.
      } else if (action === "focus") {
        courier(); fail(order.status === "run", "Corrida não está em andamento.");
        put(state, `courierFocus/${uid}`, id);
      } else if (action === "picked" || action === "roundtrip-step") {
        courier(); fail(order.status === "run", "Corrida não está em andamento.");
        if (action === "picked") { fail(order.serviceType !== "roundtrip" && !order.picked, "Retirada já registrada ou etapa inválida."); order.picked = now; }
        else { const step = Number(input.step); fail(order.serviceType === "roundtrip" && step >= 1 && step <= 3 && step === Number(order.tripStage || 0) + 1, "Etapa inválida."); order.tripStage = step; if (step === 1) order.picked = now; }
      } else if (action === "finish") {
        courier(); fail(order.status === "run" && order.picked && (order.serviceType !== "roundtrip" || order.tripStage === 3), "Confirme as etapas antes de concluir.");
        Object.assign(order, { status: "done", completed: now, durationMs: Math.max(0, now - order.accepted), paid: false, paymentStatus: "pending", paymentSchemaVersion: 2, location: null });
        if (who.pix) order.paymentPix = { ...who.pix };
      } else if (action === "cancel-free") {
        store(); fail(order.status === "run" && !order.picked && order.accepted && now - order.accepted >= 1500000, "Aguarde 25 minutos sem retirada.");
        Object.assign(order, { status: "cancelled", cancelledAt: now, cancelledBy: uid, cancellationReason: "Prazo de 25 minutos sem retirada", location: null });
      } else if (action === "cancel-quote") {
        store(); fail(["open", "cotacao", "cotacao_aceita"].includes(order.status), "Não é possível cancelar nesta etapa.");
        Object.assign(order, { status: "cancelado_cotacao", cancelledAt: now, cancelledBy: uid, location: null });
      } else if (action === "cancel") {
        courier(); fail(["open", "run", "cotacao_aceita"].includes(order.status) && !order.picked, "Não é possível devolver uma corrida após retirada.");
        order.status = order.agreedFee || Object.keys(order.bids || {}).length ? "cotacao" : "open";
        for (const field of ["courierId", "assignedCourierId", "courierName", "accepted", "picked", "location", "tripStage", "agreedFee", "quoteAcceptedAt"]) delete order[field];
        if (order.status === "cotacao") { order.fee = 0; order.bids = {}; for (const courierUid of Object.keys(previous.bids || {})) put(state, `courierBids/${courierUid}/${id}`, null); }
        order.offerGeneration = Number(order.offerGeneration || 0) + 1;
      } else if (["report-payment", "confirm-payment", "toggle-pay"].includes(action)) {
        // Compatibilidade com APK antigo: nunca permite confirmar pelo lado da loja.
        const paymentAction = action === "toggle-pay" ? (who?.role === "store" ? "report-payment" : "confirm-payment") : action;
        eventAction = paymentAction;
        if (paymentAction === "report-payment") store(); else courier();
        fail(order.status === "done", "Conclua a entrega antes de confirmar pagamento.");
        const status = paymentState(order);
        if (paymentAction === "report-payment" && status === "pending") {
          const pix = order.paymentPix || state.profiles?.couriers?.[order.courierId]?.pix;
          if (pix) order.paymentPix = { ...pix };
          Object.assign(order, { paid: false, paymentStatus: "reported", paymentSchemaVersion: 2, paymentReportedBy: uid, paymentReportedAt: now });
        } else if (paymentAction === "confirm-payment" && status !== "confirmed") {
          fail(status === "reported", "Aguarde o lojista informar o pagamento.");
          Object.assign(order, { paid: true, paymentStatus: "confirmed", paymentSchemaVersion: 2, paymentConfirmedBy: uid, paymentConfirmedAt: now });
        }
      } else if (action === "location") {
        courier(); fail(order.status === "run", "Rastreamento encerrado.");
        const { lat, lng } = input;
        fail(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180, "Localização inválida.");
        fail(!order.location || now - order.location.updatedAt >= 15000, "Aguarde a próxima atualização.", "resource-exhausted");
        order.location = { lat, lng, updatedAt: now };
        put(state, `courierLocations/${uid}`, { ...order.location });
      } else if (action === "tracking") {
        store(); fail(["open", "run"].includes(order.status), "Pedido sem rastreamento ativo.");
        if (input.revoke === true) { delete order.trackingToken; delete order.trackingExpiresAt; }
        else if (!order.trackingToken || order.trackingExpiresAt <= now || input.rotate === true) { order.trackingToken = token; order.trackingExpiresAt = now + 86400000; }
      } else throw new DomainError("invalid-argument", "Ação desconhecida.");
    }
    Logistics.afterOrder(state,id,order,previous,logisticsContext,logisticsApi);
    const paymentCommand = ["toggle-pay", "report-payment", "confirm-payment"].includes(action);
    const redundant = paymentCommand && paymentState(previous) === paymentState(order);
    if (!redundant) {
    order.revision = Number(order.revision || 0) + 1;
    order.updatedAt = now; order.lastActorUid = uid;
    projectOrder(state, id, order, previous, now);
    // GPS não multiplica o histórico de ações de negócio.
    if (action !== "location") put(state, `orderEvents/${id}/${uid}_${requestId}`, { action: eventAction, actorUid: uid, at: now, revision: order.revision });
      if (!["location", "tracking", "focus"].includes(action) && (order.courierId || previous?.courierId)) {
        const recipients = [...new Set([order.storeId, order.courierId, previous?.courierId].filter(id => id && id !== uid))];
        put(state, `pushUpdates/${id}_${order.revision}`, { orderId: id, action: eventAction, status: order.status, recipients, createdAt: now });
      }
    }
    result = { ok: true, orderId: id };
    if (action === "accept-bid") result.order = structuredClone(order);
    if (action === "tracking" && order.trackingToken) result.token = order.trackingToken;
    if (action === "accept") result.paymentReviewCount = Object.values(state.orders || {}).filter(o => o.courierId === uid && o.status === "done" && paymentState(o) === "reported").length;
  }
  put(state, `operationReceipts/${uid}/${requestId}`, { fingerprint: context.fingerprint, result, createdAt: now });
  return { state, result };
}
module.exports = { applyCommand, DomainError, eligibleOrder, publicOrder, projectOrder, courierSlots, COURIER_CAPACITY, FIVE_MINUTES, accessAllowed, courierLoad,canTakeOrder,offerAllowed,settleReturns };
