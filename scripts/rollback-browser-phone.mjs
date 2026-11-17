import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const backup=resolve(process.argv[2]||'');
const info=JSON.parse(await readFile(backup+'/rollback.json','utf8'));
if(info.project!=='express-entregas-2-testes'||info.site!=='express-v2-web-fmrpbr')throw Error('Backup inválido.');
const firebase=resolve('tests/firebase-rules/node_modules/firebase-tools/lib/bin/firebase.js');
if(info.previousVersion){
 const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','inherit']}).trim();
 const r=await fetch('https://firebasehosting.googleapis.com/v1beta1/sites/'+info.site+'/releases?versionName='+encodeURIComponent(info.previousVersion),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({message:'Restaurar navegador anterior ao pedido por celular'})});
 if(!r.ok)throw Error('Não foi possível restaurar o navegador. Nenhuma regra foi removida.');
}else{
 // First release: fall back to the original 2.0.13 browser, from the preserved APK source.
 const path=resolve('firebase.browser-rollback.json');await writeFile(path,JSON.stringify({hosting:{site:info.site,public:backup+'/browser-before',headers:[{source:'**',headers:[{key:'Cache-Control',value:'no-cache'}]}]}},null,2));
 execFileSync(process.execPath,[firebase,'deploy','--project',info.project,'--config',path,'--only','hosting'],{stdio:'inherit'});
}
// Keep the additive directory rules and records: they do not change old APK or order behavior.
// This avoids reverting unrelated rule changes made after this release or deleting customer data.
console.log('Navegador anterior restaurado. APK, pedidos e cadastros preservados.');
