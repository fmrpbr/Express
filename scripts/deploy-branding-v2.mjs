// Run in the owner's authenticated Google Cloud Shell.
// Publishes only the existing web and tracking Hosting sites.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve} from 'node:path';
const project='express-entregas-2-testes';
const release=JSON.parse(await readFile('release.json','utf8'));
if(release.version!=='2.0.15')throw Error('Este procedimento foi preparado para 2.0.15. Confira a revisão antes de publicar.');
const firebase=resolve('tests/firebase-rules/node_modules/firebase-tools/lib/bin/firebase.js');
await access(firebase);
const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','inherit']}).trim();
if(!token)throw Error('Entre na sua conta no Cloud Shell.');
const sites=['express-v2-web-fmrpbr','express-v2-rastreio-fmrpbr'];
const backup=resolve('.browser-backups/identidade-'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(backup,{recursive:true});
for(const site of sites){
 const response=await fetch('https://firebasehosting.googleapis.com/v1beta1/sites/'+site+'/releases?pageSize=1',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Não foi possível conferir o site '+site+': HTTP '+response.status+'. Publicação interrompida.');
 const previous=await response.json();
 if(!previous.releases?.[0]?.version?.name)throw Error('Versão anterior do site não identificada. Publicação interrompida.');
 await writeFile(backup+'/'+site+'.json',JSON.stringify(previous,null,2)+'\n');
}
function run(args){execFileSync(process.execPath,args,{stdio:'inherit'});}
execFileSync('npm',['run','build:browser'],{stdio:'inherit'});
run(['scripts/check.mjs']);
const browser=JSON.parse(await readFile('firebase.browser.json','utf8')).hosting;
const tracking=JSON.parse(await readFile('firebase.json','utf8')).hosting;
if(browser.site!==sites[0]||tracking.site!==sites[1])throw Error('Sites inesperados. Publicação interrompida.');
const config=resolve('firebase.browser-release.json');
// Deliberately omit database and functions: no rules, accounts or orders change.
await writeFile(config,JSON.stringify({hosting:[browser,tracking]},null,2)+'\n');
console.log('Referências anteriores preservadas em: '+backup);
run([firebase,'deploy','--project',project,'--config',config,'--only','hosting']);
console.log('Identidade 2.0.15 publicada no navegador e rastreio Firebase.');
console.log('https://'+sites[0]+'.web.app');
console.log('https://'+sites[1]+'.web.app/rastreio/');
