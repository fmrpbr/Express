"use strict";
const { createHash, randomUUID } = require("node:crypto");
const { eligibleOrder, FIVE_MINUTES, courierSlots, COURIER_CAPACITY } = require("./domain");
function validWebEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      (url.hostname === "fcm.googleapis.com" || url.hostname === "web.push.apple.com" || url.hostname.endsWith(".push.services.mozilla.com") || url.hostname.endsWith(".notify.windows.com"));
  } catch (_) { return false; }
}
const CHANNELS = { order: "express_orders_v2", quote: "express_quotes_v2", reminder: "express_reminders_v2", update: "express_updates_v2" };
function eligibleRecipient(state, uid, order, kind, orderId) {
  const prefs = state.pushPreferences?.[uid] || {};
  return !!state.profiles?.couriers?.[uid] && state.courierPresence?.[uid]?.availableForWork === true &&
    courierSlots(state, uid, orderId).length < COURIER_CAPACITY &&
    (!order.assignedCourierId || order.assignedCourierId === uid) && prefs.enabled !== false &&
    prefs[kind === "quote" ? "quotes" : "orders"] !== false;
}
function createDispatcher(db, messaging, clock = Date.now, webPush = null) {
  return async function dispatch(jobId) {
    const now = clock();
    let job;
    const claimId = randomUUID();
    await db.ref(`pushJobs/${jobId}`).get();
    const claim = await db.ref(`pushJobs/${jobId}`).transaction(current => {
      if (!current) return {};
      if (current.nextAt > now || current.leaseUntil > now) return;
      job = current;
      return { ...current, leaseUntil: now + 120000, claimId };
    });
    if (!claim.committed || claim.snapshot.val()?.claimId !== claimId) return;
    job = claim.snapshot.val();
    const root = (await db.ref().get()).val() || {};
    const order = root.orders?.[job.orderId];
    if (!eligibleOrder(order, now) || order.offerGeneration !== job.generation || (order.status === "cotacao" ? "quote" : "order") !== job.kind) {
      await db.ref(`pushJobs/${jobId}`).transaction(current => current === null ? {} : current.generation === job.generation ? null : undefined);
      return;
    }
    const category = job.slot > 0 ? "reminder" : job.kind;
    const title = job.slot > 0 ? "Pedido aguardando resposta" : job.kind === "quote" ? "Nova cotação disponível" : "Novo pedido disponível";
    const body = "Abra o Express Entregas para consultar a solicitação.";
    for (const uid of Object.keys(root.courierPresence || {})) {
      if (!eligibleRecipient(root, uid, order, job.kind, job.orderId) || (category === "reminder" && root.pushPreferences?.[uid]?.reminders === false)) continue;
      const native = Object.entries(root.fcmTokens?.[uid] || {}).map(([id, entry]) => ({ ...entry, id, platform: "android" }));
      const web = Object.entries(root.pushSubscriptions?.[uid] || {}).map(([id, entry]) => ({ ...entry, id, platform: "web" }));
      const seen = new Set();
      for (const device of [...native, ...web]) {
        const address = device.token || device.endpoint;
        if (!address || seen.has(address) || (device.platform === "web" && (!webPush || !validWebEndpoint(device.endpoint)))) continue;
        seen.add(address);
        const deliveryId = createHash("sha256").update(`${job.orderId}:${job.generation}:${job.slot}:${uid}:${address}`).digest("hex");
        const deliveryRef = db.ref(`pushDeliveries/${deliveryId}`);
        // Uma submissão por evento/dispositivo. Resultado incerto não é reenviado automaticamente.
        const delivery = await deliveryRef.transaction(current => current ? undefined : { status: "submitting", createdAt: now, claimId });
        if (!delivery.committed || delivery.snapshot.val()?.claimId !== claimId || delivery.snapshot.val()?.status !== "submitting") continue;
        // Revalidar estado, ON/OFF e preferências imediatamente antes do envio.
        const fresh = (await db.ref().get()).val() || {};
        const latest = fresh.orders?.[job.orderId];
        if (!eligibleOrder(latest, clock()) || latest.offerGeneration !== job.generation || !eligibleRecipient(fresh, uid, latest, job.kind, job.orderId) ||
          (category === "reminder" && fresh.pushPreferences?.[uid]?.reminders === false)) {
          await deliveryRef.update({ status: "cancelled" }); continue;
        }
        try {
          if (device.platform === "android") {
            await messaging.send({ token: device.token, notification: { title, body }, data: { type: job.kind, category, orderId: job.orderId },
              android: { priority: "high", collapseKey: deliveryId.slice(0, 64), notification: { channelId: CHANNELS[category], tag: deliveryId, sound: "default", priority: "max", visibility: "private" } } });
          } else {
            await webPush.sendNotification({ endpoint: device.endpoint, keys: device.keys }, JSON.stringify({ title, body, orderId: job.orderId, type: job.kind, tag: deliveryId }), { TTL: 300 });
          }
          await deliveryRef.update({ status: "sent", sentAt: clock() });
        } catch (error) {
          const invalid = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(error.code) || [404, 410].includes(error.statusCode);
          if (invalid) await db.ref(`${device.platform === "android" ? "fcmTokens" : "pushSubscriptions"}/${uid}/${device.id}`).remove();
          await deliveryRef.update({ status: invalid ? "invalid" : "failed", code: String(error.code || error.statusCode || "unknown").slice(0, 120) });
        }
      }
    }
    // Não ressuscitar o job removido por aceite/cancelamento nem sobrescrever uma nova geração.
    await db.ref(`pushJobs/${jobId}`).transaction(current => {
      if (!current) return {};
      if (current.generation !== job.generation || current.slot !== job.slot) return;
      const { leaseUntil, claimId, ...rest } = current;
      return { ...rest, nextAt: clock() + FIVE_MINUTES, slot: current.slot + 1 };
    });
  };
}
function createUpdateDispatcher(db, messaging, clock = Date.now, webPush = null) {
  return async function dispatchUpdate(eventId) {
    const update = (await db.ref(`pushUpdates/${eventId}`).get()).val();
    if (!update || !Array.isArray(update.recipients)) return;
    for (const uid of update.recipients) {
      const root = (await db.ref().get()).val() || {};
      if (!root.profiles?.stores?.[uid] && !root.profiles?.couriers?.[uid]) continue;
      const devices = [
        ...Object.entries(root.fcmTokens?.[uid] || {}).map(([id, device]) => ({ ...device, id, platform: "android" })),
        ...Object.entries(root.pushSubscriptions?.[uid] || {}).map(([id, device]) => ({ ...device, id, platform: "web" }))
      ];
      for (const device of devices) {
        const address = device.token || device.endpoint;
        if (!address || (device.platform === "web" && (!webPush || !validWebEndpoint(device.endpoint)))) continue;
        const id = createHash("sha256").update(`update:${eventId}:${uid}:${address}`).digest("hex");
        const delivery = db.ref(`pushDeliveries/${id}`);
        const claimed = await delivery.transaction(current => current ? undefined : { status: "submitting", createdAt: clock() });
        if (!claimed.committed) continue;
        const title = update.action === "finish" ? "Entrega concluída" : update.action === "report-payment" ? "Pagamento informado" : update.action === "confirm-payment" ? "Recebimento confirmado" : update.action === "toggle-pay" ? "Atualização de pagamento" : "Sua entrega foi atualizada";
        const body = update.action === "finish" ? "Confira a entrega e informe o pagamento quando realizado." : update.action === "report-payment" ? "Confira sua conta e confirme o recebimento no aplicativo." : "Abra o Express Entregas para acompanhar.";
        try {
          if (device.platform === "android") await messaging.send({ token: device.token, notification: { title, body }, data: { type: "update", orderId: update.orderId, category: "update" }, android: { priority: "high", notification: { channelId: CHANNELS.update, tag: id, sound: "default", visibility: "private" } } });
          else await webPush.sendNotification({ endpoint: device.endpoint, keys: device.keys }, JSON.stringify({ title, body, type: "update", orderId: update.orderId, tag: id }), { TTL: 300 });
          await delivery.update({ status: "sent", sentAt: clock() });
        } catch (error) {
          const invalid = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(error.code) || [404, 410].includes(error.statusCode);
          if (invalid) await db.ref(`${device.platform === "android" ? "fcmTokens" : "pushSubscriptions"}/${uid}/${device.id}`).remove();
          await delivery.update({ status: invalid ? "invalid" : "failed" });
        }
      }
    }
  };
}
module.exports = { createDispatcher, createUpdateDispatcher, eligibleRecipient, validWebEndpoint, CHANNELS };
