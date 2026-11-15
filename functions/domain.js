"use strict";

const FIVE_MINUTES = 300000;
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
function publicOrder(order) {
  const result = {};
  for (const field of ["orderCode", "status", "serviceType", "serviceDate", "city", "clientNeighborhood", "neighborhood", "selectedZone", "fee", "created", "updatedAt", "revision"])
    if (order[field] !== undefined) result[field] = order[field];
  return result;
}
function eligibleOrder(order, now) {
  return !!order && ["open", "cotacao"].includes(order.status) && (!order.expiresAt || order.expiresAt > now);
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
  put(state, `availableOrders/${id}`, order.status === "open" && !order.assignedCourierId ? publicOrder(order) : null);
  put(state, `quoteBoard/${id}`, order.status === "cotacao" ? publicOrder(order) : null);
  if (previous?.trackingToken && previous.trackingToken !== order.trackingToken)
    put(state, `publicTracking/${previous.trackingToken}`, null);
  if (order.trackingToken) {
    const active = ["open", "run"].includes(order.status) && order.trackingExpiresAt > now;
    put(state, `publicTracking/${order.trackingToken}`, active ? {
      orderCode: order.orderCode, status: order.status,
      serviceTypeLabel: order.serviceType === "roundtrip" ? "Recolha e entrega" : order.serviceType === "collection" ? "Recolha" : "Entrega",
      location: order.status === "run" ? order.location || null : null,
      updatedAt: now, expiresAt: order.trackingExpiresAt, revoked: false
    } : null);
  }
  for (const uid of new Set([previous?.courierId, order.courierId].filter(Boolean))) {
    if (state.courierPresence?.[uid]) state.courierPresence[uid].busy = Object.values(state.orders || {}).some(o => o.status === "run" && o.courierId === uid);
  }
  queueJob(state, id, order, now);
}
const defaultRates = require("./default-rates.json");
function feeFor(input, rates, now) {
  rates ||= defaultRates;
  const zone = input.selectedZone || "Sede e Bairros (Padrão)";
  let base = Number(rates.zones?.[zone]);
  fail(Number.isFinite(base) && base >= 0, "Zona sem tarifa configurada.");
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date(now)));
  if(input.paymentMethod === "card") base = Math.max(base, 10);
  if(hour >= 23) base = Math.max(base, 10);
  else if(hour >= 18) base += Number(rates.night || 3);
  if(input.bank) base = Math.max(base, Number(rates.bankService || 10));
  if(input.bag) base += Number(rates.bag ?? 10);
  return Math.round(base * 100) / 100;
}
function orderInput(input, quote) {
  fail(input && typeof input === "object", "Pedido inválido.", "invalid-argument");
  fail(["delivery", "collection", "roundtrip"].includes(input.serviceType), "Tipo de serviço inválido.");
  fail(/^\d{4}-\d{2}-\d{2}$/.test(input.serviceDate || "") && !Number.isNaN(Date.parse(input.serviceDate)) && new Date(input.serviceDate).toISOString().slice(0, 10) === input.serviceDate, "Data inválida.");
  const result = { serviceType: input.serviceType, serviceDate: input.serviceDate, bag: !quote && input.bag === true, bank: !quote && input.bank === true };
  for (const field of ["city", "clientNeighborhood"]) result[field] = text(input[field], 120, true);
  for (const field of ["client", "phone", "clientStreet", "clientNumber", "clientReference", "notes"])
    result[field] = quote ? "" : text(input[field] || "", field === "notes" ? 500 : 160, ["client", "clientStreet", "clientNumber"].includes(field));
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
  const input = command.input || {};
  const { now, newId, token } = context;
  const state = structuredClone(original || {});
  const receipt = state.operationReceipts?.[uid]?.[requestId];
  if (receipt) {
    fail(receipt.fingerprint === context.fingerprint, "Identificador reutilizado com outros dados.", "already-exists");
    return { state, result: receipt.result };
  }
  const who = profile(state, uid);
  let result = { ok: true };
  let id = command.orderId ? key(command.orderId, "Pedido") : null;
  let order = id ? state.orders?.[id] : null;
  const previous = order ? structuredClone(order) : null;
  const store = () => fail(who?.role === "store" && order?.storeId === uid, "Pedido de outra loja.", "permission-denied");
  const courier = () => fail(who?.role === "courier" && order?.courierId === uid, "Corrida de outro motoboy.", "permission-denied");
  const available = () => fail(who?.role === "courier" && state.courierPresence?.[uid]?.availableForWork === true && !Object.values(state.orders || {}).some(o => o.status === "run" && o.courierId === uid), "Ative sua disponibilidade e finalize a corrida atual.");
  if (action === "createProfile") {
    fail(!who, "Esta conta já possui perfil.");
    fail(["store", "courier"].includes(input.role), "Perfil inválido.");
    const entry = { name: text(input.name, 80, true), phone: text(input.phone, 30, true), email: String(auth.token?.email || ""), address: "", created: now };
    fail(entry.phone.replace(/\D/g, "").length >= 10, "Telefone inválido.");
    put(state, `profiles/${input.role === "store" ? "stores" : "couriers"}/${uid}`, entry);
    if (input.role === "courier") put(state, `courierPresence/${uid}`, { registered: true, online: false, busy: false, availableForWork: false, lastSeen: now });
  } else if (action === "saveProfile") {
    fail(who, "Perfil não encontrado.", "permission-denied");
    const entry = { ...state.profiles[who.role === "store" ? "stores" : "couriers"][uid], name: text(input.name, 80, true), phone: text(input.phone, 30, true), address: text(input.address, 300, true) };
    fail(entry.phone.replace(/\D/g, "").length >= 10, "Telefone inválido.");
    put(state, `profiles/${who.role === "store" ? "stores" : "couriers"}/${uid}`, entry);
  } else if (action === "registerDevice") {
    fail(who?.role === "store" || who?.role === "courier", "Perfil não encontrado.", "permission-denied");
    fail(typeof input.token === "string" && input.token.length >= 20 && input.token.length <= 4096, "Token inválido.");
    const deviceId = key(input.deviceId, "Aparelho");
    const tokenId = require("node:crypto").createHash("sha256").update(input.token).digest("hex");
    // O mesmo aparelho/token fica ligado somente à conta autenticada atual.
    for (const [owner, entries] of Object.entries(state.fcmTokens || {})) {
      for (const [entryId, entry] of Object.entries(entries)) {
        if (entry.token === input.token || entry.deviceId === deviceId) put(state, `fcmTokens/${owner}/${entryId}`, null);
      }
    }
    put(state, `fcmTokens/${uid}/${tokenId}`, { token: input.token, deviceId, platform: "android", updatedAt: now });
  } else if (action === "saveRates") {
    fail(auth.token?.admin === true, "Acesso administrativo necessário.", "permission-denied");
    fail(input.zones && Object.keys(input.zones).length > 0 && Object.keys(input.zones).length <= 100, "Tarifas inválidas.");
    const rates = { zones: {} };
    for (const [zone, value] of Object.entries(input.zones)) {
      fail(!/[.#$\[\]/]/.test(zone) && zone.length <= 120 && Number.isFinite(value) && value >= 0 && value <= 10000, "Tarifa inválida.");
      rates.zones[zone] = value;
    }
    for (const field of ["night", "rain", "weekend", "bag", "bankService"]) { const value = Number(input[field] || 0); fail(Number.isFinite(value) && value >= 0 && value <= 10000, "Adicional inválido."); rates[field] = value; }
    put(state, "config/rates", rates);
  } else {
    fail(who || auth.token?.admin === true, "Perfil não encontrado.", "permission-denied");
    if (action === "saveOrder") {
      fail(who?.role === "store", "Somente lojistas criam pedidos.", "permission-denied");
      if (id) { fail(order, "Pedido não encontrado.", "not-found"); store(); fail(["open", "cotacao", "cotacao_aceita"].includes(order.status), "Pedido não pode ser editado nesta etapa."); }
      const completing = order?.status === "cotacao_aceita";
      const quote = completing ? false : input.isQuote === true;
      if (order && !completing) fail(quote === (order.status === "cotacao"), "Não é possível trocar o modo do pedido.");
      const fields = orderInput(input, quote);
      fail(quote || who.address, "Cadastre o endereço da loja.");
      id ||= newId;
      order ||= { orderCode: `${quote ? "COT" : "EXP"}-${id.slice(-8).toUpperCase()}`, storeId: uid, created: now, createdBy: uid, paid: false, revision: 0, schemaVersion: 2, offerGeneration: 0 };
      Object.assign(order, fields, { storeName: who.name, storeAddress: who.address, status: quote ? "cotacao" : "open" });
      order.fee = completing || order.agreedFee ? order.agreedFee : quote ? 0 : feeFor(fields, state.config?.rates, now);
      if (quote) { order.bids = {}; for (const courierUid of Object.keys(previous?.bids || {})) put(state, `courierBids/${courierUid}/${id}`, null); }
      if (!previous || previous.status !== order.status) order.offerGeneration += 1;
    } else {
      fail(order, "Pedido não encontrado.", "not-found");
      if (action === "send-bid") {
        available(); fail(order.status === "cotacao", "Cotação encerrada.");
        const bid = { amount: money(input.amount), courierName: who.name, timestamp: now };
        order.bids ||= {}; order.bids[uid] = bid;
        put(state, `courierBids/${uid}/${id}`, bid);
      } else if (action === "accept-bid") {
        store(); fail(order.status === "cotacao", "Cotação já aceita ou encerrada.");
        const selected = key(input.courierId);
        const bid = order.bids?.[selected]; fail(bid && Number(input.amount) === bid.amount, "Proposta alterada ou inválida.");
        fail(state.profiles?.couriers?.[selected] && state.courierPresence?.[selected]?.availableForWork === true && !Object.values(state.orders || {}).some(o => o.status === "run" && o.courierId === selected), "Motoboy indisponível.");
        Object.assign(order, { status: "cotacao_aceita", courierId: selected, assignedCourierId: selected, courierName: bid.courierName, fee: bid.amount, agreedFee: bid.amount, quoteAcceptedAt: now });
      } else if (action === "accept") {
        available(); fail(order.status === "open" && (!order.assignedCourierId || order.assignedCourierId === uid), "Corrida já aceita ou reservada.");
        Object.assign(order, { status: "run", courierId: uid, courierName: who.name, accepted: now, tripStage: 0 });
        // Preço contratado de cotação é imutável; adicionais comuns vêm da tarifa do servidor.
        if (!order.agreedFee && input.rain === true && !order.rain) { order.fee = Math.max(order.fee, 10); order.rain = true; }
      } else if (action === "picked" || action === "roundtrip-step") {
        courier(); fail(order.status === "run", "Corrida não está em andamento.");
        if (action === "picked") { fail(order.serviceType !== "roundtrip" && !order.picked, "Retirada já registrada ou etapa inválida."); order.picked = now; }
        else { const step = Number(input.step); fail(order.serviceType === "roundtrip" && step >= 1 && step <= 3 && step === Number(order.tripStage || 0) + 1, "Etapa inválida."); order.tripStage = step; if (step === 1) order.picked = now; }
      } else if (action === "finish") {
        courier(); fail(order.status === "run" && order.picked && (order.serviceType !== "roundtrip" || order.tripStage === 3), "Confirme as etapas antes de concluir.");
        Object.assign(order, { status: "done", completed: now, durationMs: Math.max(0, now - order.accepted), paid: false, location: null });
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
      } else if (action === "toggle-pay") {
        fail(order.storeId === uid || order.courierId === uid || auth.token?.admin === true, "Pagamento de outro pedido.", "permission-denied");
        fail(order.status === "done", "Conclua a entrega antes de confirmar pagamento.");
        if (!order.paid) Object.assign(order, { paid: true, paymentStatus: "confirmed", paymentConfirmedBy: uid, paymentConfirmedAt: now });
      } else if (action === "location") {
        courier(); fail(order.status === "run", "Rastreamento encerrado.");
        const { lat, lng } = input;
        fail(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180, "Localização inválida.");
        fail(!order.location || now - order.location.updatedAt >= 15000, "Aguarde a próxima atualização.", "resource-exhausted");
        order.location = { lat, lng, updatedAt: now };
      } else if (action === "tracking") {
        store(); fail(["open", "run"].includes(order.status), "Pedido sem rastreamento ativo.");
        if (input.revoke === true) { delete order.trackingToken; delete order.trackingExpiresAt; }
        else if (!order.trackingToken || order.trackingExpiresAt <= now || input.rotate === true) { order.trackingToken = token; order.trackingExpiresAt = now + 86400000; }
      } else throw new DomainError("invalid-argument", "Ação desconhecida.");
    }
    const redundant = action === "toggle-pay" && previous?.paid === true;
    if (!redundant) {
    order.revision = Number(order.revision || 0) + 1;
    order.updatedAt = now; order.lastActorUid = uid;
    projectOrder(state, id, order, previous, now);
    // GPS não multiplica o histórico de ações de negócio.
    if (action !== "location") put(state, `orderEvents/${id}/${uid}_${requestId}`, { action, actorUid: uid, at: now, revision: order.revision });
      if (action !== "location" && action !== "tracking" && (order.courierId || previous?.courierId)) {
        const recipients = [...new Set([order.storeId, order.courierId, previous?.courierId].filter(id => id && id !== uid))];
        put(state, `pushUpdates/${id}_${order.revision}`, { orderId: id, action, status: order.status, recipients, createdAt: now });
      }
    }
    result = { ok: true, orderId: id };
    if (action === "tracking" && order.trackingToken) result.token = order.trackingToken;
  }
  put(state, `operationReceipts/${uid}/${requestId}`, { fingerprint: context.fingerprint, result, createdAt: now });
  return { state, result };
}
module.exports = { applyCommand, DomainError, eligibleOrder, publicOrder, projectOrder, FIVE_MINUTES };
