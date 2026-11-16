import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const project='express-entregas-2-testes';
const config=JSON.parse(await readFile('firebase.json','utf8'));
if(config.functions?.source!=='functions'||config.functions?.runtime!=='nodejs22')throw Error('Configuração diferente do ambiente de testes.');
await readFile('functions/.env.'+project,'utf8');
execFileSync('gcloud',['services','enable','firebasedatabase.googleapis.com','--project',project],{stdio:'inherit'});
execFileSync('firebase',['deploy','--only','database,functions:orderCommand,functions:onPushJobCreated,functions:processPushReminders,functions:onOrderUpdateCreated','--project',project],{stdio:'inherit',env:{...process.env,GCLOUD_PROJECT:project,GOOGLE_CLOUD_QUOTA_PROJECT:project}});
console.log('Tarifas e regras publicadas no projeto de testes. Nenhum pedido foi migrado e nenhuma nova tarifa foi ativada. Agende a primeira tabela no painel admin.');
