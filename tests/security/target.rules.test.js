import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { get, ref, set, update } from "firebase/database";
import test, { before, after, beforeEach } from "node:test";

const envPromise = initializeTestEnvironment({
  projectId: "demo-express-entregas-security",
  database: {
    rules: readFileSync(resolve(process.cwd(), "database.rules.candidate.json"), "utf8"),
    host: "127.0.0.1",
    port: 9000
  }
});
let env;
before(async () => { env = await envPromise; });
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async ({ database }) => {
    const db = database();
    const now = Date.now();
    await set(ref(db, "profiles/stores/storeA"), { name: "Loja A" });
    await set(ref(db, "profiles/stores/storeB"), { name: "Loja B" });
    await set(ref(db, "profiles/couriers/courierA"), { name: "Motoboy A" });
    await set(ref(db, "orders/orderA"), { storeId: "storeA", courierId: "courierA", status: "open" });
    await set(ref(db, "orders/orderB"), { storeId: "storeB", status: "open" });
    await set(ref(db, "storeOrders/storeA/orderA"), true);
    await set(ref(db, "storeOrders/storeB/orderB"), true);
    await set(ref(db, "courierOrders/courierA/orderA"), true);
    await set(ref(db, "availableOrders/orderB"), true);
    await set(ref(db, "quoteBoard/quoteA"), { city: "Aracruz" });
    await set(ref(db, "courierPresence/courierA"), { registered: true, online: true, busy: false, lastSeen: now });
    await set(ref(db, "publicTracking/public-token"), { status: "run" });
    await set(ref(db, "fcmTokens/storeA/deviceA"), { token: "fake-token-12345678901234567890", platform: "android", updatedAt: now });
  });
});
const dbAs = uid => env.authenticatedContext(uid).database();
const anon = () => env.unauthenticatedContext().database();

test("loja consulta somente seu índice de pedidos", async () => {
  await assertSucceeds(get(ref(dbAs("storeA"), "storeOrders/storeA")));
  await assertFails(get(ref(dbAs("storeA"), "storeOrders/storeB")));
  await assertFails(get(ref(dbAs("storeA"), "orders")));
  await assertFails(get(ref(dbAs("storeA"), "orders/orderB")));
});
test("motoboy consulta sua fila e quadro de cotações, sem acesso à fila de outra loja", async () => {
  await assertSucceeds(get(ref(dbAs("courierA"), "courierOrders/courierA")));
  await assertSucceeds(get(ref(dbAs("courierA"), "availableOrders")));
  await assertSucceeds(get(ref(dbAs("courierA"), "quoteBoard")));
  await assertFails(get(ref(dbAs("storeA"), "availableOrders")));
});
test("presença só fica visível para usuários com perfil válido", async () => {
  await assertSucceeds(get(ref(dbAs("storeA"), "courierPresence")));
  await assertSucceeds(get(ref(dbAs("courierA"), "courierPresence")));
  await assertFails(get(ref(dbAs("visitor"), "courierPresence")));
  await assertFails(get(ref(anon(), "courierPresence")));
});
test("somente o próprio motoboy pode alterar sua presença", async () => {
  const next = { registered: true, online: false, busy: false, lastSeen: Date.now() };
  await assertSucceeds(set(ref(dbAs("courierA"), "courierPresence/courierA"), next));
  await assertFails(set(ref(dbAs("storeA"), "courierPresence/courierA"), next));
  await assertFails(set(ref(dbAs("courierA"), "courierPresence/courierB"), next));
});
test("motoboy pode ativar e pausar sua disponibilidade sem alterar presença online", async () => {
  const ownPresence = ref(dbAs("courierA"), "courierPresence/courierA");
  await assertSucceeds(update(ownPresence, { availableForWork: true }));
  await assertSucceeds(update(ownPresence, { availableForWork: false }));
  await assertFails(update(ref(dbAs("storeA"), "courierPresence/courierA"), { availableForWork: true }));
  await assertFails(update(ref(dbAs("courierA"), "courierPresence/courierB"), { availableForWork: true }));
});
test("rastreamento continua público apenas para token existente", async () => {
  await assertSucceeds(get(ref(anon(), "publicTracking/public-token")));
  await assertFails(get(ref(anon(), "publicTracking/unknown-token")));
});
test("token FCM permanece privado por UID", async () => {
  await assertSucceeds(get(ref(dbAs("storeA"), "fcmTokens/storeA")));
  await assertFails(get(ref(dbAs("storeB"), "fcmTokens/storeA")));
});
test("pedido canônico e índices não podem ser alterados diretamente pelo cliente", async () => {
  await assertFails(set(ref(dbAs("storeA"), "orders/newOrder"), { storeId: "storeA", status: "open" }));
  await assertFails(set(ref(dbAs("storeA"), "storeOrders/storeA/newOrder"), true));
  await assertFails(set(ref(dbAs("courierA"), "availableOrders/newOrder"), true));
});
