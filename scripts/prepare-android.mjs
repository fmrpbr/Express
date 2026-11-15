import { readFile, writeFile } from 'node:fs/promises';
const path='android/app/src/main/AndroidManifest.xml';
let manifest=await readFile(path,'utf8');
manifest=manifest.replace('<manifest xmlns:android="http://schemas.android.com/apk/res/android">','<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">');
manifest=manifest.replace('android:allowBackup="true"','android:allowBackup="false"');
if(!manifest.includes('tools:replace="android:exported"')) manifest=manifest.replace('</application>',`
        <service android:name="com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService"
            android:exported="false" tools:replace="android:exported" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="express_orders_v2" />
    </application>`);
await writeFile(path,manifest);
const gradlePath='android/app/build.gradle';
let gradle=await readFile(gradlePath,'utf8');
const versionCode=200000+Number(process.env.GITHUB_RUN_NUMBER || 1);
if(!Number.isSafeInteger(versionCode)||versionCode<=0||versionCode>2100000000) throw new Error('Código de versão inválido');
gradle=gradle.replace(/versionCode \d+/,`versionCode ${versionCode}`).replace(/versionName "[^"]+"/,'versionName "2.0.1-teste"');
await writeFile(gradlePath,gradle);
if(!gradle.includes("apply plugin: 'com.google.gms.google-services'")) throw new Error('Plugin Google Services ausente');
const google=JSON.parse(await readFile('android/app/google-services.json','utf8'));
if(google.project_info.project_id!=='express-entregas-2-testes'||!google.client.some(c=>c.client_info.android_client_info.package_name==='com.fmrpbr.express.v2')) throw new Error('Firebase Android incorreto');
console.log('Android: Firebase de testes, versão, serviço privado, canal e backup configurados.');
