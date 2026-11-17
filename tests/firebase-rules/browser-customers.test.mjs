import {before,after,beforeEach,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {get,ref,set} from 'firebase/database';
let env;
const key='5527998887766';
const entry=()=>({phone:key,name:'CLIENTE',street:'RUA A',number:'12',neighborhood:'CENTRO',reference:'',city:'ARACRUZ',zone:'',revision:1,updatedAt:Date.now()});
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-express-phone-rules',database:{host:'127.0.0.1',port:9000,rules:await readFile('browser/database.rules.json','utf8')}});});
after(async()=>env.cleanup());
beforeEach(async()=>{await env.clearDatabase();await env.withSecurityRulesDisabled(async c=>{const db=c.database();for(const id of ['a','b'])await set(ref(db,'profiles/stores/'+id),{name:id,accessStatus:'approved'});await set(ref(db,'profiles/stores/blocked'),{accessStatus:'blocked'});await set(ref(db,'profiles/couriers/moto'),{name:'MOTO',accessStatus:'approved'});});});
test('somente a loja titular consulta e grava cada cliente; listagem e outros perfis são negados',async()=>{
 const a=env.authenticatedContext('a').database();await assertSucceeds(set(ref(a,'storeCustomers/a/'+key),entry()));await assertSucceeds(get(ref(a,'storeCustomers/a/'+key)));
 for(const c of [env.unauthenticatedContext(),env.authenticatedContext('b'),env.authenticatedContext('moto'),env.authenticatedContext('blocked')]){await assertFails(get(ref(c.database(),'storeCustomers/a/'+key)));await assertFails(set(ref(c.database(),'storeCustomers/a/'+key),{...entry(),revision:2}));}
 await assertFails(get(ref(a,'storeCustomers')));await assertFails(get(ref(a,'storeCustomers/a')));await assertFails(set(ref(env.authenticatedContext('blocked').database(),'storeCustomers/blocked/'+key),entry()));
});
test('telefone, campos obrigatórios, revisão e horário são validados; conflito não sobrescreve endereço',async()=>{
 const db=env.authenticatedContext('a').database(),r=ref(db,'storeCustomers/a/'+key);
 await assertFails(set(r,{...entry(),phone:'outro'}));await assertFails(set(r,{...entry(),street:''}));await assertFails(set(r,{...entry(),extra:'proibido'}));await assertFails(set(r,{...entry(),updatedAt:1}));
 await assertSucceeds(set(r,entry()));await assertFails(set(r,{...entry(),street:'CONFLITO'}));await assertSucceeds(set(r,{...entry(),street:'RUA NOVA',revision:2}));await assertFails(set(r,{...entry(),street:'ANTIGA',revision:2}));
});
