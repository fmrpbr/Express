const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
test('clique em notificação abre pedido no endereço do site, inclusive no caminho do GitHub Pages',async()=>{
 const handlers={},opened=[];let waited;
 const self={location:{href:'https://fmrpbr.github.io/Express/service-worker.js'},registration:{scope:'https://fmrpbr.github.io/Express/'},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},addEventListener:(name,fn)=>handlers[name]=fn};
 vm.runInNewContext(fs.readFileSync('scripts/service-worker.template.js','utf8'),{self,URL});
 handlers.notificationclick({notification:{data:{orderId:'EXP-123'},close(){}},waitUntil:promise=>waited=promise});await waited;
 assert.equal(opened[0],'https://fmrpbr.github.io/Express/index.html#order=EXP-123');
});
test('fonte compartilhada inclui os módulos de cliente e avisos e mantém validação de endereço',()=>{
 const html=fs.readFileSync('www/index.html','utf8');for(const file of ['phone-customers.js','order-by-phone.js','notice-policy.js'])assert.ok(html.includes('src="./'+file+'"'));
 assert.ok(html.includes('phoneOrders?.validate()'));assert.ok(html.includes('const tickerNotices='));
 assert.ok(!fs.readFileSync('browser/order-by-phone.js','utf8').includes('isNativePlatform?.())return null'));
});
