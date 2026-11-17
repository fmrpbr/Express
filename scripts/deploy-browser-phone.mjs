// Run in the project's authenticated Google Cloud Shell. Never builds or publishes an APK.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
const project='express-entregas-2-testes',site='express-v2-web-fmrpbr';
const firebase=resolve('tests/firebase-rules/node_modules/firebase-tools/lib/bin/firebase.js');
function run(cmd,args){return execFileSync(cmd,args,{stdio:'inherit'});}
const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','inherit']}).trim();
async function api(url,allowMissing=false){const r=await fetch(url,{headers:{Authorization:'Bearer '+token}});if(allowMissing&&r.status===404)return null;if(!r.ok)throw Error('Não foi possível conferir o ambiente: HTTP '+r.status);return r.json();}
// Back up the ACTUAL deployed rules, not an assumed copy from Git.
const live=await api('https://express-entregas-2-testes-default-rtdb.firebaseio.com/.settings/rules.json');
const previousRelease=await api('https://firebasehosting.googleapis.com/v1beta1/sites/'+site+'/releases?pageSize=1',true);
const backup=resolve('.browser-backups/'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(backup,{recursive:true});
await writeFile(backup+'/database-before.json',JSON.stringify(live,null,2)+'\n');
await writeFile(backup+'/hosting-before.json',JSON.stringify(previousRelease||{},null,2)+'\n');
await writeFile(backup+'/source-before.txt',execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}));
run('npm',['ci','--no-audit','--no-fund']);run('npm',['run','build:browser']);
await cp('www',backup+'/browser-before',{recursive:true});
const candidate=JSON.parse(await readFile('browser/database.rules.json','utf8'));
if(live.rules.storeCustomers&&JSON.stringify(live.rules.storeCustomers)!==JSON.stringify(candidate.rules.storeCustomers))throw Error('Já existe outra regra de clientes. Revise antes de publicar. Backup: '+backup);
const merged={...live,rules:{...live.rules,storeCustomers:candidate.rules.storeCustomers}};
await writeFile(backup+'/database-with-customers.json',JSON.stringify(merged,null,2)+'\n');
const config=JSON.parse(await readFile('firebase.browser.json','utf8'));config.database.rules=backup+'/database-with-customers.json';
const releaseConfig=resolve('firebase.browser-release.json');await writeFile(releaseConfig,JSON.stringify(config,null,2)+'\n');
// Only create our dedicated site when it does not exist. Tracking remains on its current site.
if(previousRelease===null)run(process.execPath,[firebase,'hosting:sites:create',site,'--project',project]);
const version=previousRelease?.releases?.[0]?.version?.name||null;
await writeFile(backup+'/rollback.json',JSON.stringify({project,site,previousVersion:version,backup},null,2)+'\n');
console.log('Backup concluído: '+backup);
run(process.execPath,[firebase,'deploy','--project',project,'--config',releaseConfig,'--only','database,hosting']);
console.log('Navegador publicado: https://'+site+'.web.app');
console.log('Para voltar: node scripts/rollback-browser-phone.mjs '+backup);
