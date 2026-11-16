import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const project = 'express-entregas-2-testes';
const config = JSON.parse(await readFile('firebase.json', 'utf8'));
if (config.functions?.source !== 'functions' || config.functions?.runtime !== 'nodejs22') throw new Error('Configuração de funções diferente do ambiente validado.');
await readFile('functions/.env.' + project, 'utf8');
execFileSync('firebase', ['deploy', '--only', 'functions:orderCommand,functions:onPushJobCreated,functions:processPushReminders,functions:onOrderUpdateCreated', '--project', project], {
  env: { ...process.env, GCLOUD_PROJECT: project }, stdio: 'inherit'
});
execFileSync('firebase', ['functions:list', '--project', project], { stdio: 'inherit' });
console.log('Financeiro V2 publicado no projeto de testes. Instale o APK 2.0.4 e confira Pix, informação pela loja e confirmação pelo motoboy.');
