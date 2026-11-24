import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
const html = readFileSync('www/index.html', 'utf8');
execFileSync(process.execPath,['scripts/check-branding.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--check','www/admin-dashboard.js']);
for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
for(const file of ['domain.js', 'logistics.js', 'return-scheduler.js', 'payments.js', 'tariffs.js', 'tariff-scheduler.js', 'commands.js', 'notifications.js', 'notification-tools.js', 'notification-policy.js', 'alert-notifications.js', 'index.js']) execFileSync(process.execPath, ['--check', 'functions/' + file]);
JSON.parse(readFileSync('database.rules.json', 'utf8'));
if(/onValue\(ref\(db, "orders"\)/.test(html)) throw new Error('Leitura global no cliente');
if(/(?:set|update|runTransaction)\(ref\(db, ["`]orders/.test(html)) throw new Error('Gravação direta de pedido');
console.log('Sintaxe, regras JSON e ausência de acessos globais de pedidos: OK');

const release=JSON.parse(readFileSync("release.json","utf8"));
if(!html.includes(`const APP_VERSION="${release.version}";`) || !html.includes(`Versão ${release.display_version ?? release.version}`))throw Error("Versões da interface divergentes");
if(!readFileSync("scripts/prepare-android.mjs","utf8").includes("release.version"))throw Error("Android sem versão compartilhada");
if(!readFileSync("scripts/service-worker.template.js","utf8").includes("./brand.css"))throw Error("Tema ausente do cache offline");
console.log("Versão compartilhada e tema offline: OK");
