import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { patchBackgroundGeolocation } from './patch-background-geolocation.mjs';
await patchBackgroundGeolocation();
await mkdir('android/app/src/main/res/drawable', { recursive: true });
await writeFile('android/app/src/main/res/drawable/ic_express_notification.xml', `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFFFF" android:pathData="M12,2a7,7 0,0 0,-7 7c0,5 7,13 7,13s7,-8 7,-13a7,7 0,0 0,-7 -7zM12,6a3,3 0,1 1,0 6a3,3 0,0 1,0 -6z" /></vector>`);
await writeFile('android/app/src/main/res/values/express_tracking.xml', `<resources><string name="capacitor_background_geolocation_notification_icon">drawable/ic_express_notification</string><string name="capacitor_background_geolocation_notification_channel_name">Localização da corrida</string></resources>`);
await copyFile('native/MainActivity.java', 'android/app/src/main/java/com/fmrpbr/express/v2/MainActivity.java');
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
gradle=gradle.replace(/versionCode \d+/,`versionCode ${versionCode}`).replace(/versionName "[^"]+"/,'versionName "2.0.7-teste"');
await writeFile(gradlePath,gradle);
if(!gradle.includes("apply plugin: 'com.google.gms.google-services'")) throw new Error('Plugin Google Services ausente');
const google=JSON.parse(await readFile('android/app/google-services.json','utf8'));
if(google.project_info.project_id!=='express-entregas-2-testes'||!google.client.some(c=>c.client_info.android_client_info.package_name==='com.fmrpbr.express.v2')) throw new Error('Firebase Android incorreto');
console.log('Android: Firebase de testes, versão, serviço privado, canal e backup configurados.');
