"use strict";
const { createHash, randomUUID } = require("node:crypto");
const { eligibleOrder, FIVE_MINUTES, courierSlots, COURIER_CAPACITY, accessAllowed,canTakeOrder,offerAllowed } = require("./domain");
const Policy=require('./notification-policy');
const {validWebEndpoint}=Policy;
const CHANNELS=Policy.LEGACY;
function eligibleRecipient(state, uid, order, kind, orderId, now=Date.now()) {
  const prefs = state.pushPreferences?.[uid] || {};
  return accessAllowed(state.profiles?.couriers?.[uid]) && state.courierPresence?.[uid]?.availableForWork === true &&
    canTakeOrder(state,uid,order,orderId) && offerAllowed(order,uid,now) &&
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
      if (!eligibleRecipient(root, uid, order, job.kind, job.orderId, clock()) || (category === "reminder" && root.pushPreferences?.[uid]?.reminders === false)) continue;
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
        if (!eligibleOrder(latest, clock()) || latest.offerGeneration !== job.generation || !eligibleRecipient(fresh, uid, latest, job.kind, job.orderId, clock()) ||
          (category === "reminder" && fresh.pushPreferences?.[uid]?.reminders === false)) {
          await deliveryRef.update({ status: "cancelled" }); continue;
        }
        try {
          if (device.platform === "android") {
            await messaging.send({ token: device.token, notification: { title, body }, data: { type: job.kind, category, orderId: job.orderId, notificationId:deliveryId },
              android: { priority: "high", ttl:300000, collapseKey: deliveryId.slice(0, 64), notification: { channelId: Policy.channel(device,category), tag: deliveryId, sound: device.notificationSchema===Policy.SCHEMA?"express_alert":"default", icon:"ic_express_notification", priority: "max", visibility: "private" } } });
          } else {
            await webPush.sendNotification({ endpoint: device.endpoint, keys: device.keys }, JSON.stringify({ title, body, orderId: job.orderId, type: job.kind, category, tag: deliveryId }), { TTL: 300 });
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
    const eventRef=db.ref(`pushUpdates/${eventId}`);
    const event=(await eventRef.get()).val();
    if(!event||!Array.isArray(event.recipients))return;
    if(event.expiresAt && event.expiresAt<=clock()) {await db.ref(`pushUpdateRetries/${eventId}`).remove();return;}
    const root=(await db.ref().get()).val()||{};
    if(event.action==='operational-alert' && (!root.alerts?.[event.alertId] || root.alerts[event.alertId].cancelledAt || root.alerts[event.alertId].expiresAt<=clock()))return;
    let nextRetry=null,foreignInFlight=false;
    const category=['operational-alert','rain-signal'].includes(event.action)?'alert':event.action==='notification-test'?Policy.category(event.category):'update';
    const titles={'notification-test':'Teste de notificação Express','operational-alert':'Novo alerta operacional','rain-signal':'Chuva sinalizada na sede',finish:'Entrega concluída','report-payment':'Pagamento informado','confirm-payment':'Recebimento confirmado','toggle-pay':'Atualização de pagamento'};
    const title=event.action==='announcement'?event.title:titles[event.action]||'Sua entrega foi atualizada';
    const body=event.action==='notification-test'?'Teste de aviso e som. Confira o toque neste dispositivo.':event.action==='rain-signal'?'Dois ou mais motoboys sinalizaram chuva. Confira a condição no painel. A taxa não foi ativada.':event.action==='operational-alert'?'Há um aviso novo na central de alertas. Abra o Express para conferir.':event.action==='announcement'?event.body:event.action==='finish'?'Confira a entrega e informe o pagamento quando realizado.':event.action==='report-payment'?'Confira sua conta e confirme o recebimento no aplicativo.':'Abra o Express Entregas para acompanhar.';
    const data=event.action==='notification-test'?{type:'test',category,eventId}:event.action==='rain-signal'?{type:'admin-rain',category}:event.action==='operational-alert'?{type:'alert',alertId:event.alertId,category}:event.action==='announcement'?{type:'announcement',noticeId:event.noticeId,category}:{type:'update',orderId:event.orderId,category};
    for(const uid of [...new Set(event.recipients)]) {
      if(!accessAllowed(root.profiles?.stores?.[uid])&&!accessAllowed(root.profiles?.couriers?.[uid])&&root.notificationAccounts?.[uid]?.role!=='admin')continue;
      if(event.action==='operational-alert'&&root.pushPreferences?.[uid]?.alerts===false)continue;
      const devices=[...Object.entries(root.fcmTokens?.[uid]||{}).map(([id,d])=>({...d,id,platform:'android'})),...Object.entries(root.pushSubscriptions?.[uid]||{}).map(([id,d])=>({...d,id,platform:'web'}))];
      const seen=new Set();
      for(const device of devices) {
        if(event.testTarget&&(device.platform!==event.testTarget.platform||device.id!==event.testTarget.id))continue;
        const address=device.token||device.endpoint;
        if(!address||seen.has(address)||(device.platform==='web'&&!validWebEndpoint(device.endpoint)))continue;
        seen.add(address);
        const id=createHash('sha256').update(`update:${eventId}:${uid}:${address}`).digest('hex');
        if(device.platform==='web'&&!webPush){if(event.action==='notification-test')await db.ref(`pushTestResults/${uid}/${eventId}/devices/${id}`).set({status:'failed',platform:'web',code:'web-push/not-configured'});continue;}
        const delivery=db.ref(`pushDeliveries/${id}`),claimId=randomUUID(),now=clock();
        const claim=await delivery.transaction(current=>{
          if(current && !(current.status==='retry'&&current.nextAt<=now&&current.attempts<3))return;
          return {status:'submitting',createdAt:current?.createdAt||now,attempts:(current?.attempts||0)+1,claimId};
        });
        if(!claim.committed||claim.snapshot.val()?.claimId!==claimId) {
          const current=claim.snapshot.val();if(current?.status==='submitting')foreignInFlight=true;if(current?.status==='retry'&&current.attempts<3)nextRetry=Math.min(nextRetry??Infinity,current.nextAt);
          continue;
        }
        const attempts=claim.snapshot.val().attempts;
        const testRef=event.action==='notification-test'?db.ref(`pushTestResults/${uid}/${eventId}/devices/${id}`):null;
        try {
          // Revalidate account/device ownership after claiming; logout and account switch cancel delivery.
          const path=`${device.platform==='android'?'fcmTokens':'pushSubscriptions'}/${uid}/${device.id}`;
          const current=(await db.ref(path).get()).val();
          if(!current||(current.token||current.endpoint)!==address){await delivery.update({status:'cancelled'});if(testRef)await testRef.set({status:'cancelled',platform:device.platform});continue;}
          const profilesNow=(await db.ref('profiles').get()).val()||{};
          if(!accessAllowed(profilesNow.stores?.[uid])&&!accessAllowed(profilesNow.couriers?.[uid])&&root.notificationAccounts?.[uid]?.role!=='admin'){await delivery.update({status:'cancelled'});continue;}
          if(event.action==='operational-alert'){const alertNow=(await db.ref(`alerts/${event.alertId}`).get()).val();if(!alertNow||alertNow.cancelledAt||alertNow.expiresAt<=clock()){await delivery.update({status:'cancelled'});continue;}}
          if(device.platform==='android')await messaging.send({token:device.token,notification:{title,body},data:{...data,notificationId:id},android:{priority:'high',ttl:300000,notification:{channelId:Policy.channel(device,category),tag:id,sound:device.notificationSchema===Policy.SCHEMA?'express_alert':'default',icon:'ic_express_notification',visibility:'private',priority:'max'}}});
          else await webPush.sendNotification({endpoint:device.endpoint,keys:device.keys},JSON.stringify({title,body,...data,tag:id}),{TTL:300,urgency:'high'});
          await delivery.update({status:'sent',sentAt:clock()});if(testRef)await testRef.set({status:'sent',platform:device.platform,at:clock()});
        }catch(error){
          const f=Policy.failure(error);const retry=f.retryable&&attempts<3;const nextAt=clock()+60000*attempts;
          if(f.invalid)await db.ref(`${device.platform==='android'?'fcmTokens':'pushSubscriptions'}/${uid}/${device.id}`).remove();
          await delivery.update({status:f.invalid?'invalid':retry?'retry':'failed',code:f.code,...(retry?{nextAt}:{})});
          if(retry)nextRetry=Math.min(nextRetry??Infinity,nextAt);
          if(testRef)await testRef.set({status:f.invalid?'invalid':retry?'retry':'failed',platform:device.platform,code:f.code});
        }
      }
    }
    if(nextRetry!==null)await db.ref(`pushUpdateRetries/${eventId}`).set({nextAt:nextRetry});
    else if(!foreignInFlight)await db.ref(`pushUpdateRetries/${eventId}`).remove();
  };
}
module.exports={createDispatcher,createUpdateDispatcher,eligibleRecipient,validWebEndpoint,CHANNELS};
