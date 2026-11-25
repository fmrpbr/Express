"use strict";
const { createHash, randomBytes, timingSafeEqual } = require("node:crypto");
const Policy = require("./notification-policy");

function offerKey(order, kind, round) {
  if (!order) return "";
  if (kind === "favorite") {
    return order.favoriteOffer?.status === "pending" ? "favorite:" + order.favoriteOffer.createdAt : "";
  }
  if (kind === "round") {
    return round && round.generation === Number(order.offerGeneration || 0) && round.expiresAt > 0
      ? ["round", round.generation, round.round, round.expiresAt].join(":") : "";
  }
  return order.favoriteOffer?.status === "pending" ? "" : "public:" + Number(order.offerGeneration || 0);
}

function currentOfferKey(state, id, key) {
  const kind = String(key).split(":", 1)[0];
  if (!["favorite", "round", "public"].includes(kind)) return false;
  return offerKey(state.orders?.[id], kind, state.offerRounds?.[id]) === key;
}

const digest = value => createHash("sha256").update(value).digest("hex");

function offerRouteLabel(order) {
  if (!order) return "";
  if (order.kind === "route") {
    return [order.storeNeighborhood || "Loja", "Várias paradas"].join(" → ");
  }
  const clean = value => String(value || "").trim().replace(/\s+/g, " ").slice(0, 48);
  const storeCity = clean(order.storeCity || order.city);
  const clientCity = clean(order.clientCity || order.city);
  const crossCity = storeCity && clientCity && storeCity.localeCompare(clientCity, "pt-BR", { sensitivity: "base" }) !== 0;
  const stop = (area, city, fallback) => area ? [area, crossCity ? city : ""].filter(Boolean).join(", ") : city || fallback;
  const store = stop(clean(order.storeNeighborhood), storeCity, "Loja");
  const client = stop(clean(order.clientNeighborhood || order.neighborhood), clientCity, "Cliente");
  const startsAtClient = ["collection", "roundtrip"].includes(order.serviceType);
  return (startsAtClient ? [client, store] : [store, client]).join(" → ");
}

async function androidMessage({ device, uid, delivery, data, title, body, ttl, now, key, order }) {
  const channelId = Policy.channel(device, data.category);
  const android = { priority: "high", ttl };
  const route = key ? offerRouteLabel(order) : "";
  if (!device.offerActions || (!key && data.type !== "test") ||
      (!key && data.category !== "order")) {
    return { token: device.token, notification: { title, body: route || body }, data, android: {
      ...android, collapseKey: data.notificationId, notification: { channelId, tag: data.notificationId,
        sound: Policy.sound(device, data.category), icon: "ic_express_notification", priority: "max", visibility: "private" }
    } };
  }
  const expiresAt = now + ttl;
  const offerData = { ...data, offerMode: "android-actions-v1", owner: uid, title,
    body: route || body,
    expiresAt: String(expiresAt), channelId, noticeKey: key || "test" };
  if (key && !key.startsWith("public:")) {
    const token = randomBytes(32).toString("hex");
    await delivery.child("offerResponse").set({
      digest: digest(token), uid, orderId: data.orderId, deviceId: device.id,
      tokenDigest: digest(device.token), key, expiresAt
    });
    offerData.declineToken = token;
  }
  return { token: device.token, data: offerData, android };
}

function createAndroidDecline(db, execute, clock = Date.now) {
  return async function decline(body) {
    const { deliveryId, token } = body || {};
    if (!/^[a-f0-9]{64}$/.test(deliveryId || "") || !/^[a-f0-9]{64}$/.test(token || "")) return 400;
    const grant = (await db.ref("pushDeliveries/" + deliveryId + "/offerResponse").get()).val();
    if (!grant || grant.expiresAt <= clock() || !timingSafeEqual(Buffer.from(grant.digest), Buffer.from(digest(token)))) return 404;
    const device = (await db.ref(`fcmTokens/${grant.uid}/${grant.deviceId}`).get()).val();
    if (!device?.offerActions || !device.token || digest(device.token) !== grant.tokenDigest) return 404;
    try {
      await execute({ uid: grant.uid }, { action: "decline-offer", orderId: grant.orderId,
        input: { noticeKey: grant.key }, requestId: "notice_decline_" + deliveryId });
      return 204;
    } catch (error) {
      if (["failed-precondition", "permission-denied", "not-found"].includes(error.code)) return 409;
      throw error;
    }
  };
}

module.exports = { offerKey, currentOfferKey, androidMessage, createAndroidDecline };
