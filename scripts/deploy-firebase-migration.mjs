// Run inside the downloaded project in the owner's authenticated Cloud Shell.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve} from 'node:path';
const project='express-entregas-2-testes';
const sites=['express-v2-web-fmrpbr','express-v2-rastreio-fmrpbr'];
const firebase=resolve('tests/firebase-rules/node_modules/firebase-tools/lib/bin/firebase.js');
await access(firebase);
const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','inherit']}).trim();
if(!token)throw Error('Entre na sua conta no Cloud Shell.');
const backup=resolve('.browser-backups/migracao-'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(backup,{recursive:true});
for(const site of sites){
 const r=await fetch('https://firebasehosting.googleapis.com/v1beta1/sites/'+site+'/releases?pageSize=1',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Não foi possível conferir '+site+': HTTP '+r.status+'.');
 const previous=await r.json();
 if(!previous.releases?.[0]?.version?.name)throw Error('Referência anterior não encontrada: '+site);
 await writeFile(backup+'/'+site+'.json',JSON.stringify(previous,null,2)+'\n');
}
execFileSync(process.execPath,['scripts/prepare-firebase-migration.mjs'],{stdio:'inherit'});
const config=JSON.parse(await readFile('firebase.browser-release.json','utf8'));
if(Object.keys(config).some(key=>key!=='hosting')||config.hosting.some(s=>!sites.includes(s.site)))throw Error('Configuração além do Hosting. Publicação interrompida.');
console.log('Referências anteriores preservadas em '+backup);
execFileSync(process.execPath,[firebase,'deploy','--project',project,'--config','firebase.browser-release.json','--only','hosting'],{stdio:'inherit'});
console.log('Distribuição pública no Firebase concluída. DNS e visibilidade GitHub permanecem para a próxima etapa.');
console.log('https://express-v2-web-fmrpbr.web.app/');
console.log('https://express-v2-web-fmrpbr.web.app/cadastro/');
console.log('https://express-v2-web-fmrpbr.web.app/download/');
