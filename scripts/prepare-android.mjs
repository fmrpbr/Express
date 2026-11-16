import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import './prepare-branding.mjs';
import { patchBackgroundGeolocation } from './patch-background-geolocation.mjs';
await patchBackgroundGeolocation();
await mkdir('android/app/src/main/res/drawable', { recursive: true });
await writeFile('android/app/src/main/res/values/express_tracking.xml', `<resources><string name="capacitor_background_geolocation_notification_icon">drawable/ic_express_notification</string><string name="capacitor_background_geolocation_notification_color">#EA1D2C</string><string name="capacitor_background_geolocation_notification_channel_name">Localização da corrida</string></resources>`);
await copyFile('native/ExpressNotificationsPlugin.java', 'android/app/src/main/java/com/fmrpbr/express/v2/ExpressNotificationsPlugin.java');
await copyFile('native/MainActivity.java', 'android/app/src/main/java/com/fmrpbr/express/v2/MainActivity.java');
// Bundled notification tone; no external file, media playback or DND bypass.
await mkdir('android/app/src/main/res/raw',{recursive:true});
const sampleRate=22050,seconds=1.05,samples=Math.floor(sampleRate*seconds),wave=Buffer.alloc(44+samples*2);
wave.write('RIFF');wave.writeUInt32LE(36+samples*2,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(sampleRate,24);wave.writeUInt32LE(sampleRate*2,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(samples*2,40);
for(let i=0;i<samples;i++){const t=i/sampleRate,n=Math.floor(t/0.35),within=t%0.35,env=within<0.27?Math.min(within/0.015,1)*Math.max(0,1-within/0.27):0;wave.writeInt16LE(Math.round(Math.sin(2*Math.PI*[784,988,1175][Math.min(n,2)]*t)*env*15000),44+i*2);}
await writeFile('android/app/src/main/res/raw/express_alert.wav',wave);
const path='android/app/src/main/AndroidManifest.xml';
let manifest=await readFile(path,'utf8');
manifest=manifest.replace('<manifest xmlns:android="http://schemas.android.com/apk/res/android">','<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">');
manifest=manifest.replace('android:allowBackup="true"','android:allowBackup="false"');
if(!manifest.includes('tools:replace="android:exported"')) manifest=manifest.replace('</application>',`
        <service android:name="com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService"
            android:exported="false" tools:replace="android:exported" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="express_orders_sound_v1" />
    </application>`);
manifest=manifest.replace('android:value="express_orders_v2"','android:value="express_orders_sound_v1"');
if(!manifest.includes('com.google.firebase.messaging.default_notification_icon'))manifest=manifest.replace('</application>','<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_express_notification" /></application>');
if(!manifest.includes('com.google.firebase.messaging.default_notification_color'))manifest=manifest.replace('</application>','<meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/express_red" /></application>');
manifest=manifest.replace(/android:icon="[^"]*"/,'android:icon="@mipmap/ic_launcher"').replace(/android:roundIcon="[^"]*"/,'android:roundIcon="@mipmap/ic_launcher_round"');
await writeFile(path,manifest);
const gradlePath='android/app/build.gradle';
let gradle=await readFile(gradlePath,'utf8');
const versionCode=200000+Number(process.env.GITHUB_RUN_NUMBER || 1);
if(!Number.isSafeInteger(versionCode)||versionCode<=0||versionCode>2100000000) throw new Error('Código de versão inválido');
gradle=gradle.replace(/versionCode \d+/,`versionCode ${versionCode}`).replace(/versionName "[^"]+"/,'versionName "2.0.10-teste"');
await writeFile(gradlePath,gradle);
if(!gradle.includes("apply plugin: 'com.google.gms.google-services'")) throw new Error('Plugin Google Services ausente');
const google=JSON.parse(await readFile('android/app/google-services.json','utf8'));
if(google.project_info.project_id!=='express-entregas-2-testes'||!google.client.some(c=>c.client_info.android_client_info.package_name==='com.fmrpbr.express.v2')) throw new Error('Firebase Android incorreto');
console.log('Android: Firebase de testes, versão, serviço privado, canal e backup configurados.');
