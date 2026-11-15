const admin = require("firebase-admin");
const { onValueCreated } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({ region: "southamerica-east1", maxInstances: 5 });

const db = admin.database();
const CHANNELS = {
  order: "express_orders_v2",
  quote: "express_quotes_v2",
  reminder: "express_reminders_v2"
};

function channelFor(kind, prefs) {
  // Preferências podem escolher somente canais conhecidos e provisionados no APK.
  const selected = prefs && prefs.channels && prefs.channels[kind];
  return Object.values(CHANNELS).includes(selected) ? selected : CHANNELS[kind];
}

async function sendToCourier(uid, payload) {
  const [presenceSnap, tokenSnap, prefsSnap] = await Promise.all([
    db.ref(`courierPresence/${uid}`).get(),
    db.ref(`fcmTokens/${uid}`).get(),
    db.ref(`pushPreferences/${uid}`).get()
  ]);
  const presence = presenceSnap.val() || {};
  if (presence.availableForWork !== true || presence.online !== true) return 0;
  const tokens = Object.values(tokenSnap.val() || {}).map(x => x && x.token).filter(Boolean);
  if (!tokens.length) return 0;
  const prefs = prefsSnap.val() || {};
  if (prefs.enabled === false || (payload.kind === "quote" && prefs.quotes === false) ||
      (payload.kind === "order" && prefs.orders === false) ||
      (payload.kind === "reminder" && prefs.reminders === false)) return 0;

  let sent = 0;
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const result = await admin.messaging().sendEachForMulticast({
      tokens: batch,
      notification: { title: payload.title, body: payload.body },
      data: {
        type: payload.kind,
        orderId: String(payload.orderId || ""),
        category: payload.kind
      },
      android: {
        priority: "high",
        notification: {
          channelId: channelFor(payload.kind, prefs),
          sound: "default",
          priority: "max",
          visibility: "public"
        }
      }
    });
    sent += result.successCount;
    const invalid = [];
    result.responses.forEach((response, index) => {
      if (!response.success && [
        "messaging/registration-token-not-registered",
        "messaging/invalid-registration-token"
      ].includes(response.error && response.error.code)) invalid.push(batch[index]);
    });
    if (invalid.length) {
      const all = tokenSnap.val() || {};
      const updates = {};
      for (const [key, entry] of Object.entries(all)) {
        if (entry && invalid.includes(entry.token)) updates[key] = null;
      }
      if (Object.keys(updates).length) await db.ref(`fcmTokens/${uid}`).update(updates);
    }
  }
  return sent;
}

async function notifyEligible(kind, orderId, record, reminder = false) {
  const presenceSnap = await db.ref("courierPresence").get();
  const presence = presenceSnap.val() || {};
  const recipients = Object.entries(presence)
    .filter(([, p]) => p && p.availableForWork === true && p.online === true && p.busy !== true)
    .map(([uid]) => uid);
  const payload = {
    kind: reminder ? "reminder" : kind,
    orderId,
    title: reminder ? "Pedido aguardando resposta" : (kind === "quote" ? "Nova cotação disponível" : "Novo pedido disponível"),
    body: reminder ? "Ainda há uma solicitação aguardando sua resposta." :
      (kind === "quote" ? "Uma nova cotação precisa da sua avaliação." : "Há uma nova entrega disponível.")
  };
  const results = await Promise.allSettled(recipients.map(uid => sendToCourier(uid, payload)));
  return results.filter(x => x.status === "fulfilled").reduce((sum, x) => sum + x.value, 0);
}

exports.onAvailableOrderCreated = onValueCreated("/availableOrders/{orderId}", async event => {
  const record = event.data.val();
  if (!record) return;
  const orderId = event.params.orderId;
  await notifyEligible("order", orderId, record);
  await db.ref(`pushJobs/${orderId}`).set({
    kind: "order", active: true, createdAt: Date.now(),
    nextAt: Date.now() + 5 * 60 * 1000, reminderCount: 0
  });
});

exports.onQuoteCreated = onValueCreated("/quoteBoard/{orderId}", async event => {
  const record = event.data.val();
  if (!record) return;
  const orderId = event.params.orderId;
  await notifyEligible("quote", orderId, record);
  await db.ref(`pushJobs/${orderId}`).set({
    kind: "quote", active: true, createdAt: Date.now(),
    nextAt: Date.now() + 5 * 60 * 1000, reminderCount: 0
  });
});

// Agendador durável: não depende de timers dentro do processo da função.
exports.processPushReminders = onSchedule("every 1 minutes", async () => {
  const now = Date.now();
  const due = await db.ref("pushJobs").orderByChild("nextAt").endAt(now).limitToFirst(100).get();
  if (!due.exists()) return;
  for (const [orderId, job] of Object.entries(due.val())) {
    const projectionPath = job.kind === "quote" ? "quoteBoard" : "availableOrders";
    const [projection, canonical] = await Promise.all([
      db.ref(`${projectionPath}/${orderId}`).get(),
      db.ref(`orders/${orderId}`).get()
    ]);
    if (!job.active || !projection.exists()) {
      await db.ref(`pushJobs/${orderId}`).remove();
      continue;
    }
    const order = canonical.val() || {};
    if (["run", "done", "cancelled", "cancelado", "cancelado_cotacao"].includes(order.status)) {
      await db.ref(`pushJobs/${orderId}`).remove();
      continue;
    }
    await notifyEligible(job.kind, orderId, projection.val(), true);
    await db.ref(`pushJobs/${orderId}`).update({
      nextAt: now + 5 * 60 * 1000,
      reminderCount: Number(job.reminderCount || 0) + 1,
      lastSentAt: now
    });
  }
});
