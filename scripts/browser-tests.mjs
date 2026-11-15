import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const env={...process.env};for(const name of Object.keys(env)) if(/proxy/i.test(name)) delete env[name];
const root=resolve('.');
for(const name of Object.keys(process.env)) if(/proxy/i.test(name)) delete process.env[name];
process.env.FUNCTIONS_EMULATOR = "true";
// Mesmo wrapper callable oficial, servido por TCP: evita Unix sockets do Functions Emulator.
const express = require('../functions/node_modules/express');
const callable = express();
callable.use(express.json());
callable.all('/demo-express-entregas-browser/southamerica-east1/orderCommand', require('../functions/index.js').orderCommand);
const callableServer = callable.listen(5001, '127.0.0.1');
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/www/firebase-config.js') {
    const source=(await readFile('www/firebase-config.example.js','utf8')).replaceAll('express-entregas-2-testes', 'demo-express-entregas-browser').replace('vapidPublicKey: ""','useEmulators: true, vapidPublicKey: ""');
    res.setHeader('Content-Type','application/javascript');res.end(source);return;
  }
  const file=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
server.listen(8080,'127.0.0.1',()=>{
  const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test'],{stdio:'inherit',env});
  child.on('exit',code=>{server.close();callableServer.close();process.exit(code||0);});
});
