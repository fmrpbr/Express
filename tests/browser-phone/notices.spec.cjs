const {test,expect}=require('@playwright/test');
const admin=require('../../functions/node_modules/firebase-admin');
let app,db;
test.beforeAll(async()=>{app=admin.initializeApp({projectId:'demo-express-entregas-browser',databaseURL:'https://demo-express-entregas-browser-default-rtdb.firebaseio.com'},'notice-test');db=app.database();});
test.afterAll(async()=>app.delete());
test('visão geral compacta, avisos com prazo, substituição e histórico sem alterar APK',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8080/browser-dist/');
  const email='notices-'+Date.now()+'@example.test';
  await page.locator('#tab-register').click();await page.locator('#auth-name').fill('Loja Avisos');
  await page.locator('#auth-extra').fill('27999999999');await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill('test-password-123');await page.locator('#auth-submit-btn').click();
  await expect(page.getByRole('heading',{name:'Cadastro aguardando aprovação'})).toBeVisible();
  const user=await app.auth().getUserByEmail(email);
  await db.ref('profiles/stores/'+user.uid).update({accessStatus:'approved',address:'RUA DA LOJA, 1, CENTRO'});
  await expect(page.getByRole('heading',{name:'Cadastro aguardando aprovação'})).toHaveCount(0);
  await expect(page.locator('.dashboard-section')).toHaveCount(0);
  await expect(page.locator('[data-open-sheet][data-sheet-mode=delivery]').first()).toBeVisible();
  await expect(page.locator('[data-browser-preferences]')).not.toHaveAttribute('open','');
  const now=Date.now();await page.clock.setFixedTime(new Date(now));
  await db.ref('systemNotices').set({
    rain_active_old:{title:'TAXA DIA DE CHUVA ATIVADA',body:'ANTERIOR',createdAt:now-120000,expiresAt:now+86400000},
    rain_active_new:{title:'Taxa de chuva desativada',body:'ATUAL',createdAt:now-60000,expiresAt:now+86400000},
    tariff_active_old:{title:'Tabela de entrega atualizada',body:'NOVOS VALORES',createdAt:now-300000,expiresAt:now+86400000}
  });
  await expect(page.locator('[data-browser-notice]')).toHaveCount(1);
  await expect(page.locator('[data-browser-notice]')).toContainText('Taxa de chuva desativada');
  await expect(page.locator('#hero-alert-track')).toContainText('Tabela de entrega atualizada');
  await expect(page.locator('#hero-alert-track')).not.toContainText('TAXA DIA DE CHUVA ATIVADA');
  await page.locator('[data-browser-preferences] summary').click();
  await page.locator('[data-browser-preferences] [data-nav=tariffs]').click();
  await expect(page.locator('#content')).toContainText('Taxa de chuva');
  await page.evaluate(()=>window.__express.setView('dashboard'));
  await expect(page.locator('[data-browser-preferences]')).toHaveAttribute('open','');
  await page.clock.setFixedTime(new Date(now+121000));
  await expect(page.locator('[data-browser-notice]')).toHaveCount(0,{timeout:5000});
  await expect(page.locator('#hero-alert-track')).toContainText('Taxa de chuva desativada');
  await page.clock.setFixedTime(new Date(now+4*60*60*1000));
  await expect(page.locator('#hero-alert-track')).not.toContainText('Taxa de chuva desativada',{timeout:5000});
  await page.evaluate(()=>window.__express.setView('alerts'));
  await page.locator('[data-browser-notice-history] summary').click();
  await expect(page.locator('[data-browser-notice-history]')).toContainText('TAXA DIA DE CHUVA ATIVADA');
  await expect(page.locator('[data-browser-notice-history]')).toContainText('Substituído ou encerrado');
  await page.screenshot({path:'test-results/browser-notices-history.png',fullPage:true});
  expect(errors).toEqual([]);
});
