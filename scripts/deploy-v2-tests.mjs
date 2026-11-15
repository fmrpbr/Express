import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const project = 'express-entregas-2-testes';
const site = 'express-v2-rastreio-fmrpbr';
const config = JSON.parse(await readFile('firebase.json', 'utf8'));
if(config.functions?.runtime !== 'nodejs22' || config.hosting?.site !== site || config.hosting?.public !== 'public-tracking')
  throw new Error('Configuração diferente do ambiente de testes esperado.');
await readFile('functions/.env.' + project, 'utf8');
const run = (args, json = false) => execFileSync('firebase', [...args, '--project', project, ...(json ? ['--json'] : [])], {
  env: { ...process.env, GCLOUD_PROJECT: project }, encoding: 'utf8', stdio: json ? ['inherit','pipe','inherit'] : 'inherit'
});
// List only the authorized project's sites. Never take over an existing site in
// another project or overwrite the default website.
execFileSync('gcloud', ['services','enable','firebasehosting.googleapis.com','--project',project], { stdio: 'inherit' });
const response = JSON.parse(run(['hosting:sites:list'], true));
if(response.status !== 'success' || !Array.isArray(response.result?.sites)) throw new Error('Não foi possível verificar os sites do projeto.');
if(!response.result.sites.some(item => item.name.endsWith('/sites/' + site))) run(['hosting:sites:create', site]);
run(['deploy', '--only', 'functions:orderCommand,functions:onPushJobCreated,functions:processPushReminders,functions:onOrderUpdateCreated,hosting']);
run(['functions:list']);
const url = `https://${site}.web.app/rastreio/`;
const page = await fetch(url, { cache: 'no-store' });
if(!page.ok || !(await page.text()).includes('Acompanhe sua entrega')) throw new Error('Deploy terminou, mas a página pública ainda não respondeu como esperado.');
console.log('Página pública confirmada:', url);
console.log('Agora atualize o APK 2.0.3 e teste duas corridas e o link enviado pela loja.');
