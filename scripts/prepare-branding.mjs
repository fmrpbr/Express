import {cp,mkdir,copyFile,readFile} from 'node:fs/promises';
await cp('native/res','android/app/src/main/res',{recursive:true});
for(const density of ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']){
 const dir='android/app/src/main/res/mipmap-'+density;await mkdir(dir,{recursive:true});
 for(const name of ['ic_launcher','ic_launcher_round'])await copyFile('icons/launcher/'+density+'.png',dir+'/'+name+'.png');
}
await copyFile('icons/icon-512.png','android/app/src/main/res/drawable/ic_express_brand.png');
const icon=await readFile('icons/icon-512.png');
if(icon.readUInt32BE(16)!==512||icon.readUInt32BE(20)!==512)throw Error('Ícone principal deve ter 512px.');
console.log('Marca Android: ícones legados, adaptativos, temáticos e de notificação preparados.');
