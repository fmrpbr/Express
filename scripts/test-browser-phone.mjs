import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const config=JSON.parse(await readFile('firebase.json','utf8'));config.database.rules='browser/database.rules.json';delete config.hosting;
const configPath='firebase.phone-test.json',runnerPath='scripts/.browser-phone-runner.mjs';
let runner=await readFile('scripts/browser-tests.mjs','utf8');runner=runner.replace("pathname==='/www/firebase-config.js'","(pathname==='/browser-dist/firebase-config.js'||pathname==='/www/firebase-config.js')").replace("'test'],","'test','--config','playwright.phone.config.cjs'],");
await writeFile(configPath,JSON.stringify(config));await writeFile(runnerPath,runner);
const env={...process.env};for(const k of Object.keys(env))if(/proxy/i.test(k))delete env[k];
try{
 const r=spawnSync(process.execPath,['tests/firebase-rules/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--config',configPath,'--project','demo-express-entregas-browser','--only','auth,database','node --test tests/firebase-rules/browser-customers.test.mjs && node '+runnerPath],{stdio:'inherit',env,timeout:240000});
 process.exitCode=r.status??1;
}finally{await unlink(configPath);await unlink(runnerPath);}
