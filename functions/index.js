"use strict";
const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onValueCreated } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret, defineString } = require("firebase-functions/params");
const { createCommandHandler } = require("./commands");
const { createDispatcher, createUpdateDispatcher } = require("./notifications");
const { DomainError } = require("./domain");
const { activateTariffs } = require("./tariff-scheduler");
const webPush = require("web-push");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId || (projectId !== "express-entregas-2-testes" && !projectId.startsWith("demo-express-entregas"))) throw new Error("Backend V2 restrito ao projeto de testes.");
admin.initializeApp(process.env.FUNCTIONS_EMULATOR === "true" ? { projectId, databaseURL: `https://${projectId}-default-rtdb.firebaseio.com` } : undefined);
setGlobalOptions({ region: "southamerica-east1", maxInstances: 5 });
const db = admin.database();
const execute = createCommandHandler(db);
const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
const vapidPrivate = isEmulator ? null : defineSecret("EXPRESS_VAPID_PRIVATE_KEY");
const vapidPublic = isEmulator ? { value: () => "" } : defineString("EXPRESS_VAPID_PUBLIC_KEY", { default: "" });
const vapidSubject = isEmulator ? { value: () => "" } : defineString("EXPRESS_VAPID_SUBJECT", { default: "" });
const pushSecrets = process.env.FUNCTIONS_EMULATOR === "true" ? [] : [vapidPrivate];
function transports() {
  let web = null;
  if (vapidPublic.value() && vapidSubject.value()) {
    webPush.setVapidDetails(vapidSubject.value(), vapidPublic.value(), vapidPrivate.value());
    web = webPush;
  }
  return { messaging: admin.messaging(), web };
}
exports.orderCommand = onCall(async request => {
  try { return await execute(request.auth, request.data); }
  catch (error) {
    if (error instanceof DomainError) throw new HttpsError(error.code, error.message);
    console.error("Falha na operação V2", error.code || error.name);
    throw new HttpsError("internal", "Não foi possível concluir. Tente novamente com a mesma operação.");
  }
});
exports.onPushJobCreated = onValueCreated({ ref: "/pushJobs/{jobId}", region: "us-central1", secrets: pushSecrets }, async event => { const t = transports(); return createDispatcher(db, t.messaging, Date.now, t.web)(event.params.jobId); });
exports.processPushReminders = onSchedule({ schedule: "every 1 minutes", secrets: pushSecrets }, async () => {
  const now=Date.now();
  await activateTariffs(db,now);
  const due = await db.ref("pushJobs").orderByChild("nextAt").endAt(Date.now()).limitToFirst(100).get();
  for (const id of Object.keys(due.val() || {})) {
    const t = transports(); await createDispatcher(db, t.messaging, Date.now, t.web)(id);
  }
  const retries=await db.ref('pushUpdateRetries').orderByChild('nextAt').endAt(now).limitToFirst(100).get();
  for(const id of Object.keys(retries.val()||{})){const t=transports();await createUpdateDispatcher(db,t.messaging,Date.now,t.web)(id);}
});

const {createAlertNotification}=require('./alert-notifications');
exports.onAlertCreated=onValueCreated({ref:'/alerts/{alertId}',region:'us-central1'},event=>createAlertNotification(db)(event.params.alertId));
exports.onOrderUpdateCreated = onValueCreated({ ref: "/pushUpdates/{eventId}", region: "us-central1", secrets: pushSecrets }, async event => { const t = transports(); return createUpdateDispatcher(db, t.messaging, Date.now, t.web)(event.params.eventId); });

// Retorna somente a chave pública. A chave privada permanece no Secret Manager.
const { createNotificationTools } = require('./notification-tools');
const notificationTools = createNotificationTools(db, () => ({vapidPublicKey:vapidPublic.value()}));
exports.notificationTools = onCall(async request => {
  try { return await notificationTools(request.auth, request.data); }
  catch(error) {
    if(error instanceof DomainError) throw new HttpsError(error.code,error.message);
    console.error('Falha na ferramenta de notificações',error.code||error.name);
    throw new HttpsError('internal','Não foi possível preparar a notificação. Tente novamente.');
  }
});
