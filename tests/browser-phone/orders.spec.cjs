const {test,expect}=require('@playwright/test');
const admin=require('../../functions/node_modules/firebase-admin');
let app,db;
const base='http://127.0.0.1:8080/browser-dist/';
test.beforeAll(async()=>{app=admin.initializeApp({projectId:'demo-express-entregas-browser',databaseURL:'https://demo-express-entregas-browser-default-rtdb.firebaseio.com'},'phone-test');db=app.database();await db.ref().set(null);});
test.afterAll(async()=>app.delete());
async function login(page,email){
 await page.goto(base);await page.locator('#tab-register').click();
 await page.locator('#auth-name').fill('Loja Teste');await page.locator('#auth-extra').fill('27999999999');await page.locator('#auth-email').fill(email);await page.locator('#auth-password').fill('test-password-123');await page.locator('#auth-submit-btn').click();
 await expect(page.getByRole('heading',{name:'Cadastro aguardando aprovação'})).toBeVisible();
 const user=await app.auth().getUserByEmail(email);await db.ref('profiles/stores/'+user.uid).update({accessStatus:'approved',address:'RUA DA LOJA, 1, CENTRO'});
 await expect(page.getByRole('heading',{name:'Cadastro aguardando aprovação'})).toHaveCount(0);return user.uid;
}
async function open(page){await page.evaluate(()=>window.__express.openSheet());await expect(page.locator('#phone-customer-panel')).toBeVisible();}
async function lookup(page,phone){await page.locator('#inp-phone').fill(phone);await expect(page.locator('[data-phone-status]')).not.toHaveText(/Consultando|Informe o celular/);}
async function fill(page,street='Rua Primeira'){
 await page.locator('#inp-client').fill('Cliente João');await page.locator('#inp-street').fill(street);await page.locator('#inp-number').fill('25');await page.locator('#input-neighborhood').fill('Centro');await page.locator('#quote-city').fill('Aracruz');
}
async function send(page){await page.locator('#btn-submit-order').click();await expect(page.locator('#order-sheet-overlay')).not.toHaveClass(/active/);}
test('cliente novo, confirmação obrigatória, persistência em outro aparelho e alterações temporárias/permanentes',async({browser})=>{
 const context=await browser.newContext();const page=await context.newPage();const email='phone-'+Date.now()+'@example.test';const uid=await login(page,email);
 await open(page);await lookup(page,'(27) 99888-7766');await expect(page.locator('[data-phone-status]')).toContainText('Cliente novo');await fill(page);
 await page.locator('#btn-submit-order').click();await expect(page.locator('#order-sheet-overlay')).toHaveClass(/active/);expect((await db.ref('orders').get()).exists()).toBe(false);
 await page.locator('[data-phone-confirm]').click();await send(page);
 await expect.poll(async()=>(await db.ref('storeCustomers/'+uid+'/5527998887766').get()).val()?.street).toBe('RUA PRIMEIRA');
 const c2=await browser.newContext();const second=await c2.newPage();await second.goto(base);await second.locator('#auth-email').fill(email);await second.locator('#auth-password').fill('test-password-123');await second.locator('#auth-submit-btn').click();await expect(second.locator('#login-screen')).toBeHidden();
 await open(second);await lookup(second,'+55 27 99888-7766');await expect(second.locator('[data-phone-summary]')).toContainText('RUA PRIMEIRA');await second.screenshot({path:'test-results/phone-customer-confirm.png',fullPage:true});await second.locator('[data-phone-use]').click();await send(second);
 await open(second);await lookup(second,'27998887766');await second.locator('[data-phone-edit]').click();await expect(second.locator('[data-phone-save]')).not.toBeChecked();await second.locator('#inp-street').fill('Rua Trabalho');await second.locator('[data-phone-confirm]').click();await send(second);
 expect((await db.ref('storeCustomers/'+uid+'/5527998887766').get()).val().street).toBe('RUA PRIMEIRA');
 await open(second);await lookup(second,'27998887766');await second.locator('[data-phone-edit]').click();await second.locator('#inp-street').fill('Rua Nova');await second.locator('[data-phone-save]').check();await second.locator('[data-phone-confirm]').click();await send(second);
 expect((await db.ref('storeCustomers/'+uid+'/5527998887766').get()).val().street).toBe('RUA NOVA');
 await open(second);await lookup(second,'27998887766');await second.locator('[data-phone-use]').click();await second.locator('#inp-phone').fill('27991112233');await expect(second.locator('[data-phone-status]')).toContainText('Cliente novo');await expect(second.locator('#inp-street')).toHaveValue('');
 await context.close();await c2.close();
});
test('cotações e versão original do APK continuam sem a busca por celular',async({page})=>{
 await login(page,'quotephone-'+Date.now()+'@example.test');
 await page.evaluate(()=>window.__express.openSheet(null,'quote'));await expect(page.locator('#phone-customer-panel')).toBeHidden();await expect(page.locator('#inp-phone')).not.toHaveAttribute('required','');
 await page.goto('http://127.0.0.1:8080/www/');expect(await page.locator('script[src*="order-by-phone"]').count()).toBe(0);
});
test('conflito no cadastro avisa sem duplicar o pedido já enviado',async({page})=>{
 const uid=await login(page,'conflict-'+Date.now()+'@example.test');
 const path='storeCustomers/'+uid+'/5527998887766';
 const customer={phone:'5527998887766',name:'JOAO',street:'RUA ORIGINAL',number:'1',neighborhood:'CENTRO',reference:'',city:'ARACRUZ',zone:'',revision:1,updatedAt:Date.now()};await db.ref(path).set(customer);
 await open(page);await lookup(page,'27998887766');await page.locator('[data-phone-edit]').click();await page.locator('#inp-street').fill('Rua Alterada');await page.locator('[data-phone-save]').check();await page.locator('[data-phone-confirm]').click();
 await db.ref(path).update({street:'RUA DE OUTRA SESSAO',revision:2});await send(page);
 await expect(page.locator('#toasts')).toContainText('Pedido enviado. O cadastro do cliente não foi atualizado');
 const orders=Object.values((await db.ref('orders').get()).val()||{}).filter(o=>o.storeId===uid);expect(orders.length).toBe(1);expect((await db.ref(path).get()).val().street).toBe('RUA DE OUTRA SESSAO');
});
