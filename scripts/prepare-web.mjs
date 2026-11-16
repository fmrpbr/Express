import { mkdir, copyFile, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('www/icons', { recursive: true });
await copyFile('functions/payments.js', 'www/payments.js');
try { await access('www/firebase-config.js'); } catch { await copyFile('www/firebase-config.example.js', 'www/firebase-config.js'); }
for (const size of [192, 512]) await copyFile(`icons/icon-${size}.png`, `www/icons/icon-${size}.png`);
const source = await readFile('www/index.html', 'utf8');
const version = createHash('sha256').update(source).update(await readFile('functions/payments.js')).update(await readFile('package-lock.json')).update(await readFile('firebase-entry.js')).update(await readFile('native-push-entry.js')).update(await readFile('scripts/service-worker.template.js')).digest('hex').slice(0, 12);
const worker = (await readFile('scripts/service-worker.template.js', 'utf8')).replaceAll('__VERSION__', version);
await writeFile('www/service-worker.js', worker);
const rootShell = ['./index.html','./www/index.html','./www/payments.js','./www/manifest.webmanifest','./www/icons/icon-192.png','./www/icons/icon-512.png','./www/vendor/firebase.bundle.js','./www/vendor/native-push.bundle.js'];
await writeFile('service-worker.js', worker.replace(/^const APP_SHELL = .*$/m, 'const APP_SHELL = ' + JSON.stringify(rootShell) + ';'));
