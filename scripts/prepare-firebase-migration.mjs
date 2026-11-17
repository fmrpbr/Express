// Prepare only public runtime assets. Never copy repository history or backend source.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile,cp,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const release=JSON.parse(await readFile('release.json','utf8'));
const apk=JSON.parse(await readFile('public-site/apk-release.json','utf8'));
if(release.version!==apk.version||!/^Express-Entregas-V2-[0-9.]+-Teste\.apk$/.test(apk.file)||!/^[a-f0-9]{64}$/.test(apk.sha256)||!Number.isSafeInteger(apk.size_bytes)||apk.size_bytes<1)throw Error('Metadados do APK incompatíveis com a revisão.');
execFileSync('npm',['run','build:browser'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/check.mjs'],{stdio:'inherit'});
await mkdir('.browser-backups/apk-cache',{recursive:true});
const cached='.browser-backups/apk-cache/'+apk.file;
let bytes;
try{bytes=await readFile(cached);}catch(error){if(error.code!=='ENOENT')throw error;}
if(!bytes){
 const urls=['https://express-v2-web-fmrpbr.web.app/downloads/'+apk.file,'https://raw.githubusercontent.com/fmrpbr/Express/main/downloads/'+apk.file];
 for(const url of urls){
  const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
  if(response.status===404)continue;
  if(!response.ok)throw Error('Download do APK respondeu HTTP '+response.status+'. Nenhuma publicação executada.');
  bytes=Buffer.from(await response.arrayBuffer());break;
 }
 if(!bytes)throw Error('APK não encontrado. Copie o APK conferido para '+cached+' e execute novamente.');
}
if(bytes.length!==apk.size_bytes||createHash('sha256').update(bytes).digest('hex')!==apk.sha256)throw Error('Hash/tamanho do APK divergente. Nenhuma publicação executada.');
await writeFile(cached+'.tmp',bytes);await rename(cached+'.tmp',cached);
await mkdir('browser-dist/downloads',{recursive:true});
await mkdir('browser-dist/download',{recursive:true});
await copyFile(cached,'browser-dist/downloads/'+apk.file);
await cp('public-site/download','browser-dist/download',{recursive:true});
await writeFile('browser-dist/downloads/latest.json',JSON.stringify(apk,null,2)+'\n');
await writeFile('browser-dist/version.json',JSON.stringify({version:release.version,apk_version:apk.version,apk_sha256:apk.sha256,source_commit:apk.source_commit},null,2)+'\n');
await copyFile('release.json','browser-dist/release.json');
await cp('public-tracking/rastreio','browser-dist/rastreio',{recursive:true});
const track='browser-dist/rastreio/index.html';
await writeFile(track,(await readFile(track,'utf8')).replaceAll('"/rastreio/','"./'));
const index='browser-dist/index.html';
await writeFile(index,(await readFile(index,'utf8')).replaceAll('https://express-v2-web-fmrpbr.web.app/download/','./download/'));
// Browser links follow the current Firebase or custom domain. Existing APK links stay valid.
const config='browser-dist/firebase-config.js';
const original=await readFile(config,'utf8');
const adjusted=original.replace(/publicTrackingBaseUrl:\s*"[^"]*"/,'publicTrackingBaseUrl: window.location.origin + "/rastreio/"');
if(adjusted===original)throw Error('Configuração de rastreio não identificada. Nenhuma publicação executada.');
await writeFile(config,adjusted);
for(const file of ['browser-dist/index.html','browser-dist/cadastro/index.html','browser-dist/download/index.html']){
 const html=await readFile(file,'utf8');
 if(/(?:href|src)=["']https:\/\/(?:fmrpbr\.github\.io|github\.com)\//.test(html))throw Error('Link público ainda depende do GitHub: '+file);
}
const browser=JSON.parse(await readFile('firebase.browser.json','utf8')).hosting;
const dedicated=JSON.parse(await readFile('firebase.json','utf8')).hosting;
if(browser.site!=='express-v2-web-fmrpbr'||dedicated.site!=='express-v2-rastreio-fmrpbr')throw Error('Destinos de Hosting inesperados.');
const trackingHeaders=dedicated.headers.flatMap(entry=>entry.headers);
browser.headers.push({source:'/rastreio/**',headers:trackingHeaders});
browser.headers.push({source:'/downloads/*.apk',headers:[{key:'Content-Type',value:'application/vnd.android.package-archive'},{key:'Content-Disposition',value:'attachment'},{key:'Cache-Control',value:'public, max-age=86400'}]});
browser.headers.push({source:'/downloads/latest.json',headers:[{key:'Cache-Control',value:'no-store'}]});
// Hosting only; never include database, functions or an automatic data migration.
await writeFile('firebase.browser-release.json',JSON.stringify({hosting:[browser,dedicated]},null,2)+'\n');
console.log('Distribuição Firebase '+release.version+' preparada. APK conferido: '+apk.sha256);
