import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { courierOfferTone, standardAlertTone } from './notification-tones.mjs';
import './prepare-branding.mjs';
const release=JSON.parse(await readFile('release.json','utf8'));
if(!/^\d+\.\d+\.\d+$/.test(release.version))throw Error('Versão inválida');
import { patchBackgroundGeolocation } from './patch-background-geolocation.mjs';
await patchBackgroundGeolocation();
await mkdir('android/app/src/main/res/drawable', { recursive: true });
await writeFile('android/app/src/main/res/values/express_tracking.xml', `<resources><string name="capacitor_background_geolocation_notification_icon">drawable/ic_express_notification</string><string name="capacitor_background_geolocation_notification_color">#EA1D2C</string><string name="capacitor_background_geolocation_notification_channel_name">Localização da corrida</string></resources>`);
await copyFile('native/ExpressNotificationsPlugin.java', 'android/app/src/main/java/com/fmrpbr/express/v2/ExpressNotificationsPlugin.java');
await copyFile('native/ExpressCourierOverlay.java', 'android/app/src/main/java/com/fmrpbr/express/v2/ExpressCourierOverlay.java');
for(const name of ['ExpressOfferMessagingService','ExpressOfferNotice','ExpressOfferResponseReceiver','ExpressCourierOverlayService']){
  await copyFile('native/'+name+'.java','android/app/src/main/java/com/fmrpbr/express/v2/'+name+'.java');
}
await copyFile('native/ExpressPrintPlugin.java', 'android/app/src/main/java/com/fmrpbr/express/v2/ExpressPrintPlugin.java');
await copyFile('native/MainActivity.java', 'android/app/src/main/java/com/fmrpbr/express/v2/MainActivity.java');
// Bundled notification tone; no external file, media playback or DND bypass.
await mkdir('android/app/src/main/res/raw',{recursive:true});
await writeFile('android/app/src/main/res/raw/express_alert.wav', standardAlertTone());
await writeFile('android/app/src/main/res/raw/express_offer.wav', courierOfferTone());
const path='android/app/src/main/AndroidManifest.xml';
let manifest=await readFile(path,'utf8');
manifest=manifest.replace('<manifest xmlns:android="http://schemas.android.com/apk/res/android">','<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">');
manifest=manifest.replace('android:allowBackup="true"','android:allowBackup="false"');
if(!manifest.includes('android.permission.SYSTEM_ALERT_WINDOW'))manifest=manifest.replace('</manifest>',
  '    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />\n</manifest>');
for(const permission of ['FOREGROUND_SERVICE','FOREGROUND_SERVICE_SPECIAL_USE']){
  if(!manifest.includes('android.permission.'+permission+'"'))manifest=manifest.replace('</manifest>',
    '    <uses-permission android:name="android.permission.'+permission+'" />\n</manifest>');
}
if(!manifest.includes('ExpressOfferMessagingService'))manifest=manifest.replace('</application>',`
        <service android:name="com.capacitorjs.plugins.pushnotifications.MessagingService" tools:node="remove" />
        <service android:name=".ExpressOfferMessagingService" android:exported="false">
            <intent-filter><action android:name="com.google.firebase.MESSAGING_EVENT" /></intent-filter>
        </service>
        <receiver android:name=".ExpressOfferResponseReceiver" android:exported="false" />
        <service android:name=".ExpressCourierOverlayService" android:exported="false"
            android:stopWithTask="true" android:foregroundServiceType="specialUse">
            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="Optional movable shortcut for an on-duty courier to return to delivery offers and the active delivery" />
        </service>
    </application>`);
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
const versionCode=200001+Number(process.env.GITHUB_RUN_NUMBER || 1);
if(!Number.isSafeInteger(versionCode)||versionCode<=0||versionCode>2100000000) throw new Error('Código de versão inválido');
gradle=gradle.replace(/versionCode \d+/,`versionCode ${versionCode}`).replace(/versionName "[^"]+"/,`versionName "${release.version}-beta"`);
await writeFile(gradlePath,gradle);
if(!gradle.includes("apply plugin: 'com.google.gms.google-services'")) throw new Error('Plugin Google Services ausente');
const google=JSON.parse(await readFile('android/app/google-services.json','utf8'));
if(google.project_info.project_id!=='express-entregas-2-testes'||!google.client.some(c=>c.client_info.android_client_info.package_name==='com.fmrpbr.express.v2')) throw new Error('Firebase Android incorreto');
console.log('Android: Firebase de testes, versão, serviço privado, canal e backup configurados.');
