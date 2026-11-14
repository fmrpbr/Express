import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} from "@firebase/rules-unit-testing";
import { get, ref, set } from "firebase/database";
import test, { before, after, beforeEach } from "node:test";

const projectId = "demo-express-entregas-security";
const rules = readFileSync(resolve(process.cwd(), "../../database.rules.json"), "utf8");
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    database: { rules }
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await set(ref(db, "profiles/stores/storeA"), { name: "Loja A" });
    await set(ref(db, "profiles/stores/storeB"), { name: "Loja B" });
    await set(ref(db, "profiles/couriers/courierA"), { name: "Entregador A" });
    await set(ref(db, "profiles/couriers/courierB"), { name: "Entregador B" });
    await set(ref(db, "stores/storeA"), { name: "Loja legada A" });
    await set(ref(db, "couriers/courierA"), { name: "Entregador legado A" });
    await set(ref(db, "orders/orderA"), {
      storeId: "storeA", courierId: "courierA", status: "open"
    });
    await set(ref(db, "orders/orderB"), {
      storeId: "storeB", courierId: "courierB", status: "open"
    });
    await set(ref(db, "courierPresence/courierA"), {
      registered: true, online: true, busy: false, lastSeen: Date.now()
    });
    await set(ref(db, "courierPresence/courierB"), {
      registered: true, online: true, busy: false, lastSeen: Date.now()
    });
    await set(ref(db, "publicTracking/fake-random-token"), {
      status: "run", updatedAt: Date.now()
    });
    await set(ref(db, "fcmTokens/storeA/tokenA"), {
      token: "fake-token-value-long-enough-for-rules",
      platform: "android",
      updatedAt: Date.now()
    });
  });
});

const storeA = () => env.authenticatedContext("storeA").database();
const storeB = () => env.authenticatedContext("storeB").database();
const courierA = () => env.authenticatedContext("courierA").database();
const stranger = () => env.authenticatedContext("visitor").database();
const anonymous = () => env.unauthenticatedContext().database();

test("perfil no caminho profiles permite leitura do próprio usuário", async () => {
  await assertSucceeds(get(ref(storeA(), "profiles/stores/storeA")));
  await assertFails(get(ref(storeA(), "profiles/stores/storeB")));
});

test("caminhos legados stores/couriers não possuem permissão de leitura própria", async () => {
  await assertFails(get(ref(storeA(), "stores/storeA")));
  await assertFails(get(ref(courierA(), "couriers/courierA")));
});

test("pedido individual só pode ser lido pela loja ou motoboy associado", async () => {
  await assertSucceeds(get(ref(storeA(), "orders/orderA")));
  await assertSucceeds(get(ref(courierA(), "orders/orderA")));
  await assertFails(get(ref(storeA(), "orders/orderB")));
  await assertFails(get(ref(stranger(), "orders/orderA")));
});

test("leitura da coleção orders não autoriza consulta global sem filtro seguro", async () => {
  await assertFails(get(ref(storeA(), "orders")));
});

test("presença de motoboys fica visível para qualquer usuário autenticado", async () => {
  const snapshot = await assertSucceeds(get(ref(stranger(), "courierPresence")));
  if (!snapshot.child("courierA").exists() || !snapshot.child("courierB").exists()) {
    throw new Error("O teste esperava confirmar a exposição global atual de courierPresence.");
  }
});

test("rastreamento público é legível sem autenticação quando o token existe", async () => {
  await assertSucceeds(get(ref(anonymous(), "publicTracking/fake-random-token")));
  await assertFails(get(ref(anonymous(), "publicTracking/token-inexistente")));
});

test("token FCM só pode ser lido pelo próprio UID", async () => {
  await assertSucceeds(get(ref(storeA(), "fcmTokens/storeA")));
  await assertFails(get(ref(storeB(), "fcmTokens/storeA")));
  await assertFails(get(ref(anonymous(), "fcmTokens/storeA")));
});

test("cliente não pode gravar diretamente pedidos no estado atual das regras", async () => {
  await assertFails(set(ref(storeA(), "orders/order-new"), {
    storeId: "storeA", status: "open"
  }));
});
