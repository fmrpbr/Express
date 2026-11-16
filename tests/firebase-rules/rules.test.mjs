import { readFile } from "node:fs/promises";
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} from "@firebase/rules-unit-testing";
import { get, ref, set, query, orderByChild, startAt } from "firebase/database";

const projectId = "demo-express-entregas";
let env;

before(async () => {
  const rules = await readFile(new URL("../../database.rules.json", import.meta.url), "utf8");
  env = await initializeTestEnvironment({
    projectId,
    database: { host: "127.0.0.1", port: 9000, rules }
  });
});

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.database();
    await set(ref(db, "profiles/stores/storeA"), { name: "LOJA A" });
    await set(ref(db, "profiles/stores/storeB"), { name: "Loja B" });
    await set(ref(db, "profiles/couriers/courierA"), { name: "Motoboy A" });
    await set(ref(db, "orders/orderA"), { storeId: "storeA", courierId: "courierA", status: "open" });
    await set(ref(db, "orders/orderB"), { storeId: "storeB", courierId: "courierB", status: "open" });
    await set(ref(db, "availableOrders/orderPublic"), { status: "open", area: "Centro" });
    await set(ref(db, "quoteBoard/quotePublic"), { status: "cotacao", area: "Centro" });
    await set(ref(db, "publicTracking/token-longo-aleatorio-123456789"), { status: "run", expiresAt:Date.now()+600000, revoked:false });
    await set(ref(db, "config/rates"), { base: 10 });
    await set(ref(db, "courierPresence/courierA"), { registered:true, online:false, busy:false, lastSeen:Date.now() });
  });
});

after(async () => {
  await env.cleanup();
});

test("Pix privado só é acessível no próprio perfil e nos pedidos próprios, sem escrita direta", async () => {
  const pix = { type: 'email', key: 'pix@example.com', holder: 'MOTO' };
  await env.withSecurityRulesDisabled(async context => {
    const db = context.database();
    await set(ref(db, 'profiles/couriers/courierA/pix'), pix);
    await set(ref(db, 'storeOrders/storeA/orderA'), { storeId: 'storeA', courierId: 'courierA', status: 'done', paymentPix: pix, paid: false });
  });
  const owner = env.authenticatedContext('courierA').database();
  const store = env.authenticatedContext('storeA').database();
  const other = env.authenticatedContext('storeB').database();
  await assertSucceeds(get(ref(owner, 'profiles/couriers/courierA/pix')));
  await assertFails(get(ref(store, 'profiles/couriers/courierA/pix')));
  await assertSucceeds(get(ref(store, 'storeOrders/storeA/orderA/paymentPix')));
  await assertFails(get(ref(other, 'storeOrders/storeA/orderA/paymentPix')));
  await assertFails(get(ref(env.unauthenticatedContext().database(), 'storeOrders/storeA/orderA/paymentPix')));
  await assertFails(set(ref(owner, 'profiles/couriers/courierA/pix'), pix));
  await assertFails(set(ref(store, 'orders/orderA/paid'), true));
  await assertFails(set(ref(store, 'storeOrders/storeA/orderA/paid'), true));
});

test("loja lê apenas o próprio perfil", async () => {
  const db = env.authenticatedContext("storeA").database();
  await assertSucceeds(get(ref(db, "profiles/stores/storeA")));
  await assertFails(get(ref(db, "profiles/stores/storeB")));
});

test("loja lê pedido próprio, mas não pedido de outra loja nem a coleção inteira", async () => {
  const db = env.authenticatedContext("storeA").database();
  await assertSucceeds(get(ref(db, "orders/orderA")));
  await assertFails(get(ref(db, "orders/orderB")));
  await assertFails(get(ref(db, "orders")));
});

test("motoboy atribuído lê pedido próprio e mural reduzido", async () => {
  const db = env.authenticatedContext("courierA").database();
  await assertSucceeds(get(ref(db, "orders/orderA")));
  await assertFails(get(ref(db, "orders/orderB")));
  await assertSucceeds(get(ref(db, "availableOrders")));
  await assertSucceeds(get(ref(db, "quoteBoard")));
});

test("loja não acessa mural exclusivo de motoboys", async () => {
  const db = env.authenticatedContext("storeA").database();
  await assertFails(get(ref(db, "availableOrders")));
  await assertFails(get(ref(db, "quoteBoard")));
});

test("rastreamento permite somente leitura do token existente", async () => {
  const db = env.unauthenticatedContext().database();
  await assertSucceeds(get(ref(db, "publicTracking/token-longo-aleatorio-123456789")));
  await assertFails(get(ref(db, "orders/orderA")));
  await assertFails(get(ref(db, "publicTracking/token-inexistente")));
});

test("gravações em perfis, pedidos, índices e presença ficam bloqueadas", async () => {
  const db = env.authenticatedContext("storeA").database();
  await assertFails(set(ref(db, "profiles/stores/storeA/name"), "Alterado"));
  await assertFails(set(ref(db, "orders/orderA/status"), "done"));
  await assertFails(set(ref(db, "storeOrders/storeA/orderA"), true));
  await assertFails(set(ref(db, "courierPresence/courierA"), { online: true }));
});

test("perfil válido lê presença e motoboy altera somente disponibilidade própria", async () => {
  const courierDb = env.authenticatedContext("courierA").database();
  const storeDb = env.authenticatedContext("storeA").database();
  const otherCourierDb = env.authenticatedContext("courierB").database();
  await assertSucceeds(get(ref(storeDb, "courierPresence")));
  await assertSucceeds(set(ref(courierDb, "courierPresence/courierA/availableForWork"), true));
  await assertFails(set(ref(courierDb, "courierPresence/courierA/busy"), false));
  await assertFails(set(ref(storeDb, "courierPresence/courierA"), { registered:true, online:false, busy:false, lastSeen:Date.now() }));
  await assertFails(set(ref(otherCourierDb, "courierPresence/courierA"), { registered:true, online:false, busy:false, lastSeen:Date.now() }));
});

test("lojistas e motoboys podem publicar alertas curtos identificados, sem alterar alertas existentes", async () => {
  const storeDb = env.authenticatedContext("storeA").database();
  const courierDb = env.authenticatedContext("courierA").database();
  const createdAt = Date.now();
  const alert = { senderId:"storeA", senderRole:"store", senderName:"LOJA A", message:"MOVIMENTO INTENSO NO CENTRO", createdAt, expiresAt:createdAt+3600000 };
  await assertSucceeds(set(ref(storeDb, "alerts/alertA"), alert));
  await assertSucceeds(get(ref(courierDb, "alerts/alertA")));
  await assertFails(set(ref(storeDb, "alerts/alertA/message"), "ALTERADO"));
  await assertFails(set(ref(storeDb, "alerts/alertB"), { ...alert, senderId:"courierA" }));
  await assertFails(set(ref(courierDb, "alerts/alertC"), { ...alert, senderId:"courierA", senderRole:"courier", message:"X".repeat(121) }));
});


test("consulta indexada de alertas retorna somente avisos ainda válidos", async () => {
  const now = Date.now();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.database();
    await set(ref(db, "alerts/expired"), {
      senderId:"storeA", senderRole:"store", senderName:"LOJA A",
      message:"AVISO ANTIGO", createdAt:now-7200000, expiresAt:now-1
    });
    await set(ref(db, "alerts/active"), {
      senderId:"storeA", senderRole:"store", senderName:"LOJA A",
      message:"AVISO ATIVO", createdAt:now, expiresAt:now+3600000
    });
  });
  const db = env.authenticatedContext("courierA").database();
  const snap = await get(query(ref(db, "alerts"), orderByChild("expiresAt"), startAt(now)));
  const values = snap.val() || {};
  assert.deepEqual(Object.keys(values), ["active"]);
});

test("tarifas são alteradas somente pela operação de servidor", async () => {
  const userDb = env.authenticatedContext("storeA").database();
  const adminDb = env.authenticatedContext("adminUser", { admin: true }).database();
  await assertSucceeds(get(ref(userDb, "config/rates")));
  await assertFails(set(ref(userDb, "config/rates/base"), 20));
  await assertFails(set(ref(adminDb, "config/rates/base"), 20));
});

test("administrador lê pedidos e perfis", async () => {
  const db = env.authenticatedContext("adminUser", { admin: true }).database();
  await assertSucceeds(get(ref(db, "orders/orderA")));
  await assertSucceeds(get(ref(db, "orders/orderB")));
  await assertSucceeds(get(ref(db, "profiles/stores/storeA")));
});

test("presença ocupada e identidade de motoboy não são forjáveis", async () => {
  const courier = env.authenticatedContext("courierA").database();
  const store = env.authenticatedContext("storeA").database();
  const visitor = env.authenticatedContext("visitor").database();
  await assertFails(set(ref(courier, "courierPresence/courierA/busy"), true));
  await assertFails(set(ref(store, "courierPresence/storeA/availableForWork"), true));
  await assertFails(get(ref(visitor, "courierPresence")));
  await assertSucceeds(set(ref(courier, "courierConnections/courierA/session1"), { lastSeen: Date.now() }));
  await assertFails(set(ref(courier, "courierConnections/courierA/session1"), { lastSeen: Date.now(), busy: false }));
  await assertFails(set(ref(store, "courierConnections/courierA/session2"), { lastSeen: Date.now() }));
});
test("token vencido ou revogado e enumeração do rastreio são negados", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await set(ref(context.database(), "publicTracking/expired"), { expiresAt: Date.now()-1, revoked: false });
    await set(ref(context.database(), "publicTracking/revoked"), { expiresAt: Date.now()+600000, revoked: true });
  });
  const db = env.unauthenticatedContext().database();
  await assertFails(get(ref(db, "publicTracking/expired")));
  await assertFails(get(ref(db, "publicTracking/revoked")));
  await assertFails(get(ref(db, "publicTracking")));
});
test("tokens e preferências são privados, com esquema e tipo de perfil validados", async () => {
  const courier = env.authenticatedContext("courierA").database();
  const store = env.authenticatedContext("storeA").database();
  const record = { token: "t".repeat(30), platform: "android", updatedAt: Date.now() };
  await assertFails(set(ref(courier, "fcmTokens/courierA/device1"), record));
  await assertFails(set(ref(store, "fcmTokens/storeA/device1"), record));
  await assertFails(set(ref(env.authenticatedContext("visitor").database(), "fcmTokens/visitor/device1"), record));
  await assertFails(get(ref(store, "fcmTokens/courierA")));
  await assertSucceeds(set(ref(courier, "pushPreferences/courierA"), { enabled: true, orders: true, quotes: false, reminders: false }));
  await assertFails(set(ref(courier, "pushPreferences/courierA"), { enabled: "true" }));
  await assertFails(get(ref(store, "pushPreferences/courierA")));
  await assertFails(set(ref(courier, "pushPreferences/courierA"), { enabled: true, injected: true }));
});
test("alerta não pode falsificar perfil, remetente ou nome", async () => {
  const store = env.authenticatedContext("storeA").database();
  const now = Date.now();
  const alert = { senderId: "storeA", senderRole: "courier", senderName: "LOJA A", message: "AVISO VÁLIDO", createdAt: now, expiresAt: now+600000 };
  await assertFails(set(ref(store, "alerts/fakeRole"), alert));
  await assertFails(set(ref(store, "alerts/fakeName"), { ...alert, senderRole: "store", senderName: "ADMINISTRADOR" }));
  await assertFails(set(ref(store, "alerts/expired"), { ...alert, senderRole: "store", expiresAt: now-1 }));
});
test("Web Push só aceita endpoints conhecidos e esquema privado de inscrição", async () => {
  const db = env.authenticatedContext("courierA").database();
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/fake", keys:{p256dh:"a".repeat(87),auth:"b".repeat(22)}, updatedAt:Date.now() };
  await assertSucceeds(set(ref(db,"pushSubscriptions/courierA/device"),subscription));
  await assertFails(set(ref(db,"pushSubscriptions/courierA/device"),{...subscription,endpoint:"https://127.0.0.1/private"}));
  await assertFails(get(ref(env.authenticatedContext("storeA").database(),"pushSubscriptions/courierA")));
});
test("cliente não forja capacidade, prioridade ou GPS compartilhado do motoboy", async () => {
  const db = env.authenticatedContext("courierA").database();
  for(const path of ["courierPresence/courierA/occupiedSlots","courierPresence/courierA/activeCount","courierFocus/courierA","courierLocations/courierA"])
    await assertFails(set(ref(db,path),0));
  await assertFails(get(ref(env.unauthenticatedContext().database(),"courierLocations/courierA")));
});
