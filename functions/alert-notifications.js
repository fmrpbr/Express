'use strict';
function createAlertNotification(db,clock=Date.now){return async id=>{
  const alert=(await db.ref(`alerts/${id}`).get()).val();const now=clock();
  if(!alert||!alert.senderId||alert.expiresAt<=now||alert.createdAt<now-120000)return;
  const root=(await db.ref('profiles').get()).val()||{};
  if(!root.stores?.[alert.senderId]&&!root.couriers?.[alert.senderId])return;
  // Free-text alerts stay in the authenticated app; lock-screen text is generic.
  const accounts=(await db.ref('notificationAccounts').get()).val()||{};
  const recipients=[...new Set([...Object.keys(root.stores||{}),...Object.keys(root.couriers||{}),...Object.keys(accounts).filter(uid=>accounts[uid].role==='admin')])].filter(uid=>uid!==alert.senderId);
  if(!recipients.length)return;
  const claim=await db.ref(`alertPushLimits/${alert.senderId}`).transaction(last=>last&&last.id!==id&&now-last.at<60000?undefined:{id,at:now});
  if(!claim.committed)return;
  await db.ref(`pushUpdates/alert_${id}`).transaction(current=>current||{action:'operational-alert',alertId:id,recipients,createdAt:now,expiresAt:alert.expiresAt});
};}
module.exports={createAlertNotification};
