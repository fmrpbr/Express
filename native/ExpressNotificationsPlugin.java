package com.fmrpbr.express.v2;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.ContentResolver;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Arrays;

@CapacitorPlugin(name="ExpressNotifications")
public class ExpressNotificationsPlugin extends Plugin {
    private static final String[] IDS={"express_orders_sound_v1","express_quotes_sound_v1","express_reminders_sound_v1","express_updates_sound_v1","express_alerts_sound_v1"};
    private static final String[] NAMES={"Novos pedidos", "Novas cotações", "Lembretes", "Atualizações de entregas", "Alertas operacionais"};
    private static final String OFFER_CHANNEL = "express_courier_offers_v2";
    private static final long[] STANDARD_VIBRATION = {0, 200, 100, 200};
    private static final long[] OFFER_VIBRATION = {0, 180, 80, 180, 80, 180, 260, 180, 80, 180};

    @PluginMethod public void bindOfferNotifications(PluginCall call) {
        ExpressOfferNotice.bind(getContext(), call.getString("owner", ""));
        call.resolve();
    }

    @PluginMethod public void sampleOfferNotice(PluginCall call) {
        if (ExpressOfferNotice.sample(getContext(), call.getString("channelId", IDS[0]))) call.resolve();
        else call.reject("Ative as notificações do motoboy neste aparelho primeiro.");
    }

    @Override public void load() {
        routeOfferIntent(getActivity().getIntent());
    }

    @Override protected void handleOnNewIntent(Intent intent) {
        routeOfferIntent(intent);
    }

    private void routeOfferIntent(Intent intent) {
        if (intent == null || (!ExpressOfferNotice.ACCEPT.equals(intent.getAction()) &&
            !ExpressOfferNotice.OPEN.equals(intent.getAction()))) return;
        org.json.JSONObject notice = ExpressOfferNotice.matching(getContext(), intent);
        if (notice == null) return;
        JSObject result = new JSObject();
        result.put("accept", ExpressOfferNotice.ACCEPT.equals(intent.getAction()));
        result.put("owner", notice.optString("owner"));
        result.put("orderId", notice.optString("orderId"));
        result.put("noticeKey", notice.optString("noticeKey"));
        result.put("expiresAt", notice.optLong("expiresAt"));
        ExpressOfferNotice.dismiss(getContext(), intent);
        notifyListeners("offerAction", result, true);
    }

    private Uri tone(String name) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + getContext().getPackageName() + "/raw/" + name);
    }

    private void createChannel(NotificationManager manager, String id, String name, String sound, long[] vibration) {
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Avisos do Express Entregas com som. Configure o toque nesta categoria.");
        channel.setSound(tone(sound), new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        channel.enableVibration(true);
        channel.setVibrationPattern(vibration);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
    }

    private boolean standardOrderSettings(NotificationChannel channel) {
        return channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_HIGH
            && tone("express_alert").equals(channel.getSound())
            && channel.shouldVibrate() && Arrays.equals(STANDARD_VIBRATION, channel.getVibrationPattern())
            && !channel.canBypassDnd()
            && (Build.VERSION.SDK_INT < 30 || !channel.hasUserSetSound());
    }

    @PluginMethod public void prepare(PluginCall call) {
        try {
            boolean offerSound = false;
            if(Build.VERSION.SDK_INT>=26){
                NotificationManager manager=(NotificationManager)getContext().getSystemService(Context.NOTIFICATION_SERVICE);
                for(int i=0;i<IDS.length;i++){
                    // Keep user sound/importance choices for existing channels.
                    if(manager.getNotificationChannel(IDS[i])!=null)continue;
                    createChannel(manager, IDS[i], NAMES[i], "express_alert", STANDARD_VIBRATION);
                }
                if (Boolean.TRUE.equals(call.getBoolean("courier"))) {
                    if (manager.getNotificationChannel(OFFER_CHANNEL) == null && standardOrderSettings(manager.getNotificationChannel(IDS[0]))) {
                        createChannel(manager, OFFER_CHANNEL, "Ofertas de corrida", "express_offer", OFFER_VIBRATION);
                    }
                    offerSound = manager.getNotificationChannel(OFFER_CHANNEL) != null;
                }
            }
            JSObject result = new JSObject();
            result.put("offerSound", offerSound);
            call.resolve(result);
        }catch(Exception e){call.reject("Não foi possível preparar os canais de notificação.");}
    }
    @PluginMethod public void status(PluginCall call){
        try{
            Context context=getContext();
            NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
            AudioManager audio=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
            PowerManager power=(PowerManager)context.getSystemService(Context.POWER_SERVICE);
            JSObject result=new JSObject();
            result.put("permission",NotificationManagerCompat.from(context).areNotificationsEnabled());
            result.put("ringerMode",audio.getRingerMode());result.put("volume",audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION));
            result.put("maxVolume",audio.getStreamMaxVolume(AudioManager.STREAM_NOTIFICATION));
            result.put("doNotDisturb",manager.getCurrentInterruptionFilter()!=NotificationManager.INTERRUPTION_FILTER_ALL);
            result.put("batteryOptimized",!power.isIgnoringBatteryOptimizations(context.getPackageName()));
            JSArray channels=new JSArray();
            if(Build.VERSION.SDK_INT>=26)for(int i=0;i<IDS.length;i++){
                String id = IDS[i];
                String name = NAMES[i];
                if (i == 0 && Boolean.TRUE.equals(call.getBoolean("courier")) && manager.getNotificationChannel(OFFER_CHANNEL) != null) {
                    id = OFFER_CHANNEL;
                    name = "Ofertas de corrida";
                }
                NotificationChannel channel=manager.getNotificationChannel(id);JSObject entry=new JSObject();
                entry.put("id",id);entry.put("name",name);entry.put("exists",channel!=null);
                entry.put("importance",channel==null?0:channel.getImportance());
                entry.put("sound",channel!=null&&channel.getSound()!=null);channels.put(entry);
            }
            result.put("channels",channels);call.resolve(result);
        }catch(Exception e){call.reject("Não foi possível conferir as configurações do Android.");}
    }
    @PluginMethod public void settings(PluginCall call){
        try{
            String channel=call.getString("channel","");boolean known=OFFER_CHANNEL.equals(channel);for(String id:IDS)if(id.equals(channel))known=true;
            Intent intent;
            if(known&&Build.VERSION.SDK_INT>=26){intent=new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getContext().getPackageName()).putExtra(Settings.EXTRA_CHANNEL_ID,channel);}
            else {intent=new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getContext().getPackageName());}
            getActivity().startActivity(intent);call.resolve();
        }catch(Exception e){call.reject("Abra as notificações do Express nas configurações do Android.");}
    }

    @PluginMethod public void lockScreenSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_SETTINGS));
            call.resolve();
        } catch (RuntimeException ignored) {
            call.reject("Abra Configurações do Android e procure Notificações na tela de bloqueio.");
        }
    }
}
