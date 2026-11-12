import { readFile } from "node:fs/promises";
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} from "@firebase/rules-unit-testing";
import { get, ref, set } from "firebase/database";

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
    await set(ref(db, "profiles/stores/storeA"), { name: "Loja A" });
    await set(ref(db, "profiles/stores/storeB"), { name: "Loja B" });
    await set(ref(db, "profiles/couriers/courierA"), { name: "Motoboy A" });
    await set(ref(db, "orders/orderA"), { storeId: "storeA", courierId: "courierA", status: "open" });
    await set(ref(db, "orders/orderB"), { storeId: "storeB", courierId: "courierB", status: "open" });
    await set(ref(db, "availableOrders/orderPublic"), { status: "open", area: "Centro" });
    await set(ref(db, "quoteBoard/quotePublic"), { status: "cotacao", area: "Centro" });
    await set(ref(db, "publicTracking/token-longo-aleatorio-123456789"), { status: "run", storeName: "Loja A" });
    await set(ref(db, "config/rates"), { base: 10 });
  });
});

after(async () => {
  await env.cleanup();
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

test("somente administrador altera taxas", async () => {
  const userDb = env.authenticatedContext("storeA").database();
  const adminDb = env.authenticatedContext("adminUser", { admin: true }).database();
  await assertSucceeds(get(ref(userDb, "config/rates")));
  await assertFails(set(ref(userDb, "config/rates/base"), 20));
  await assertSucceeds(set(ref(adminDb, "config/rates/base"), 20));
});

test("administrador lê pedidos e perfis", async () => {
  const db = env.authenticatedContext("adminUser", { admin: true }).database();
  await assertSucceeds(get(ref(db, "orders/orderA")));
  await assertSucceeds(get(ref(db, "orders/orderB")));
  await assertSucceeds(get(ref(db, "profiles/stores/storeA")));
});
