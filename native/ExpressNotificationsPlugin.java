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

@CapacitorPlugin(name="ExpressNotifications")
public class ExpressNotificationsPlugin extends Plugin {
    private static final String[] IDS={"express_orders_sound_v1","express_quotes_sound_v1","express_reminders_sound_v1","express_updates_sound_v1","express_alerts_sound_v1"};
    private static final String[] NAMES={"Novos pedidos", "Novas cotações", "Lembretes", "Atualizações de entregas", "Alertas operacionais"};
    @PluginMethod public void prepare(PluginCall call) {
        try {
            if(Build.VERSION.SDK_INT>=26){
                NotificationManager manager=(NotificationManager)getContext().getSystemService(Context.NOTIFICATION_SERVICE);
                for(int i=0;i<IDS.length;i++){
                    // Keep user sound/importance choices for existing channels.
                    if(manager.getNotificationChannel(IDS[i])!=null)continue;
                    NotificationChannel channel=new NotificationChannel(IDS[i],NAMES[i],NotificationManager.IMPORTANCE_HIGH);
                    channel.setDescription("Avisos do Express Entregas com som. Configure o toque nesta categoria.");
                    channel.setSound(Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE+"://"+getContext().getPackageName()+"/raw/express_alert"),new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                    channel.enableVibration(true);channel.setVibrationPattern(new long[]{0,200,100,200});
                    channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
                    manager.createNotificationChannel(channel);
                }
            }
            call.resolve();
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
                NotificationChannel channel=manager.getNotificationChannel(IDS[i]);JSObject entry=new JSObject();
                entry.put("id",IDS[i]);entry.put("name",NAMES[i]);entry.put("exists",channel!=null);
                entry.put("importance",channel==null?0:channel.getImportance());
                entry.put("sound",channel!=null&&channel.getSound()!=null);channels.put(entry);
            }
            result.put("channels",channels);call.resolve(result);
        }catch(Exception e){call.reject("Não foi possível conferir as configurações do Android.");}
    }
    @PluginMethod public void settings(PluginCall call){
        try{
            String channel=call.getString("channel","");boolean known=false;for(String id:IDS)if(id.equals(channel))known=true;
            Intent intent;
            if(known&&Build.VERSION.SDK_INT>=26){intent=new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getContext().getPackageName()).putExtra(Settings.EXTRA_CHANNEL_ID,channel);}
            else {intent=new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getContext().getPackageName());}
            getActivity().startActivity(intent);call.resolve();
        }catch(Exception e){call.reject("Abra as notificações do Express nas configurações do Android.");}
    }
}
