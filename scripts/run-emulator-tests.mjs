import { spawnSync } from 'node:child_process';
const env = { ...process.env };
for(const name of Object.keys(env)) if(/proxy/i.test(name)) delete env[name];
const tests = process.argv.slice(2);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], { stdio: 'inherit', env, timeout: 180000 });
if(result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
