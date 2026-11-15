import { spawnSync } from 'node:child_process';
const env={...process.env};for(const name of Object.keys(env)) if(/proxy/i.test(name)) delete env[name];
const result=spawnSync(process.execPath,['tests/firebase-rules/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--config','firebase.json','--project','demo-express-entregas-browser','--only','auth,database','node scripts/browser-tests.mjs'],{stdio:'inherit',env,timeout:240000});
if(result.error) console.error(result.error.message);
process.exit(result.status??1);
