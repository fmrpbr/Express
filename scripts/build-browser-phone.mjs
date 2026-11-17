import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='browser-dist';await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await cp('www',out,{recursive:true});
let html=await readFile('www/index.html','utf8');
html=html.replace('</head>','<style>#mobile-order-form [hidden]{display:none!important}</style></head>');
function replace(from,to){if(!html.includes(from))throw Error('Ponto de integração mudou: '+from.slice(0,70));html=html.replace(from,to);}
replace('<script src="./vendor/firebase.bundle.js"></script>','<script src="./vendor/firebase.bundle.js"></script>\n<script src="./phone-customers.js"></script>\n<script src="./order-by-phone.js"></script>');
replace('  checkUrlTracking();\n  window.__expressModuleReady = true;',`  const phoneOrders=window.createBrowserPhoneOrders({
    owner:()=>role==='store'&&accountAllowed()?currentUser?.uid:null,
    lookup:async(uid,phone)=>(await get(ref(db,'storeCustomers/'+uid+'/'+phone))).val(),
    save:async s=>{if(currentUser?.uid!==s.uid)throw Error('Sessão alterada');await set(ref(db,'storeCustomers/'+s.uid+'/'+s.key),{...s.data,phone:s.key,revision:s.revision+1,updatedAt:serverTimestamp()});},
    recalculate:recalculateMobileFee,toast
  });
  checkUrlTracking();\n  window.__expressModuleReady = true;`);
replace('    recalculateMobileFee();\n  };\n\n  window.closeOrderSheet',`    recalculateMobileFee();
    phoneOrders?.open(form.dataset.mode==='quote',editId);
  };\n\n  window.closeOrderSheet`);
replace('  window.closeOrderSheet = function() {','  window.closeOrderSheet = function() {\n    phoneOrders?.close();');
replace('    if(e.target && e.target.id === "inp-client") {','    if(false && e.target && e.target.id === "inp-client") {');
replace('    if(!isQuote && !completingQuote) saveClientFavorite(clientName, clientPhone, clientStreet, clientNumber, clientNeighborhood);',`    if(!phoneOrders?.validate())return;
    const customerSnapshot=phoneOrders?.snapshot();`);
replace('      delete f.dataset.requestId; delete f.dataset.payloadFingerprint;\n      toast(completingQuote',`      delete f.dataset.requestId; delete f.dataset.payloadFingerprint;
      const customerSaved=await phoneOrders?.saved(customerSnapshot);
      if(customerSaved!==false)toast(completingQuote`);
replace('Nome do Cliente (Com sugestão de favoritos)','Nome do cliente');
replace(' list="saved-clients-list"','');
replace('Versão 2.0.13</p>','Navegador • Pedido por celular • 2.0.13-web.1</p>');
await writeFile(out+'/index.html',html);
for(const name of ['phone-customers.js','order-by-phone.js'])await cp('browser/'+name,out+'/'+name);
let worker=await readFile('www/service-worker.js','utf8');
const version=createHash('sha256').update(html).update(await readFile('browser/order-by-phone.js')).update(await readFile('browser/phone-customers.js')).digest('hex').slice(0,12);
worker=worker.replace(/const CACHE_NAME = .*;/,'const CACHE_NAME = "express-browser-phone-'+version+'";').replace("'./index.html',","'./index.html', './phone-customers.js', './order-by-phone.js',");
await writeFile(out+'/service-worker.js',worker);
const config=JSON.parse(await readFile('firebase.json','utf8'));
const rules=JSON.parse(await readFile('database.rules.json','utf8'));
const own="auth != null && auth.uid === $uid && root.child('profiles/stores').child(auth.uid).exists() && (!root.child('profiles/stores').child(auth.uid).child('accessStatus').exists() || root.child('profiles/stores').child(auth.uid).child('accessStatus').val() === 'approved')";
const item={'.read':own,'.write':own,".validate":"newData.hasChildren(['phone','name','street','number','neighborhood','reference','city','zone','revision','updatedAt']) && $phone.matches(/^55[1-9][0-9]{9,10}$/) && ((!data.exists() && newData.child('revision').val() === 1) || (data.exists() && newData.child('revision').val() === data.child('revision').val() + 1))"};
for(const [k,max,required]of [['name',160,true],['street',160,true],['number',160,true],['neighborhood',120,true],['reference',160,false],['city',120,true],['zone',120,false]])item[k]={'.validate':`newData.isString() && newData.val().length <= ${max}${required?' && newData.val().length > 0':''}`};
item.phone={'.validate':'newData.isString() && newData.val() === $phone'};
item.revision={'.validate':'newData.isNumber()'};
item.updatedAt={'.validate':'newData.isNumber() && newData.val() >= now - 60000 && newData.val() <= now + 60000'};
item.$other={'.validate':false};
rules.rules.storeCustomers={$uid:{$phone:item}};
await writeFile('browser/database.rules.json',JSON.stringify(rules,null,2)+'\n');
// Dedicated browser site: tracking and the APK deployment are not overwritten.
await writeFile('firebase.browser.json',JSON.stringify({database:{rules:'browser/database.rules.json'},hosting:{site:'express-v2-web-fmrpbr',public:out,ignore:['**/.*'],headers:[{source:'**',headers:[{key:'Cache-Control',value:'no-cache'},{key:'X-Content-Type-Options',value:'nosniff'}]}]}},null,2)+'\n');
console.log('Navegador gerado separadamente. www/index.html e APK preservados.');
