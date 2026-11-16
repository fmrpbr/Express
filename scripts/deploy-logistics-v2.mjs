import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
const project='express-entregas-2-testes';
const env={...process.env,GOOGLE_CLOUD_QUOTA_PROJECT:project,GCLOUD_PROJECT:project};
const config=JSON.parse(await readFile('firebase.json','utf8'));
if(config.functions?.runtime!=='nodejs22'||config.functions?.source!=='functions'||config.database?.rules!=='database.rules.json')throw Error('Execute na pasta do Express Entregas V2.');
// Read only the public web-push parameters. Private VAPID material stays in Secret Manager.
const existing=JSON.parse(execFileSync('gcloud',['functions','describe','onOrderUpdateCreated','--gen2','--region=us-central1','--project='+project,'--format=json(serviceConfig.environmentVariables.EXPRESS_VAPID_PUBLIC_KEY,serviceConfig.environmentVariables.EXPRESS_VAPID_SUBJECT)'],{env,encoding:'utf8',stdio:['inherit','pipe','inherit']}));
const values=existing.serviceConfig?.environmentVariables||{};
const keys=['EXPRESS_VAPID_PUBLIC_KEY','EXPRESS_VAPID_SUBJECT'];
if(!keys.every(key=>typeof values[key]==='string'&&values[key].length>0))throw Error('Não foi possível recuperar a configuração pública de notificações. A publicação não foi iniciada.');
const file='functions/.env.'+project;let prior='';try{prior=await readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
const lines=prior.split('\n').filter(line=>!keys.some(key=>line.startsWith(key+'=')));
await writeFile(file,[...lines,...keys.map(key=>key+'='+JSON.stringify(values[key]))].join('\n')+'\n',{mode:0o600});
console.log('Configuração de notificações preservada. Instalando dependências do servidor...');
execFileSync('npm',['ci','--prefix','functions'],{env,stdio:'inherit'});
console.log('Publicando regras, duas viagens, prioridade e rotas múltiplas no projeto de testes...');
execFileSync('firebase',['deploy','--project',project,'--only','database,functions:orderCommand,functions:onPushJobCreated,functions:processPushReminders,functions:onOrderUpdateCreated'],{env,stdio:'inherit'});
console.log('Servidor atualizado. Abra a versão 2.0.13 para testar as duas viagens e as rotas múltiplas.');
