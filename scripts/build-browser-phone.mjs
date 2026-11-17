import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
const out='browser-dist';await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await cp('www',out,{recursive:true});
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
console.log('Navegador 2.0.14 gerado a partir da mesma fonte do Android.');
