package com.fmrpbr.express.v2;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Map;
import java.util.HashMap;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;

final class ExpressOfferNotice {
    static final String OPEN = "com.fmrpbr.express.v2.OPEN_OFFER";
    static final String ACCEPT = "com.fmrpbr.express.v2.ACCEPT_OFFER";
    static final String DECLINE = "com.fmrpbr.express.v2.DECLINE_OFFER";
    private static final String OWNER = "courier";
    private static final String ORDER_CHANNEL = "express_orders_sound_v1";
    private static final String OFFER_CHANNEL = "express_courier_offers_v2";
    private static final String REMINDER_CHANNEL = "express_reminders_sound_v1";
    private static final int NOTIFICATION_ID = 3701;

    private ExpressOfferNotice() {}

    private static SharedPreferences state(Context context) {
        return context.getSharedPreferences("express_offer_notices", Context.MODE_PRIVATE);
    }

    static boolean sample(Context context, String channelId) {
        String owner = state(context).getString(OWNER, "");
        if (owner.isEmpty()) return false;
        Map<String, String> data = new HashMap<>();
        data.put("notificationId", UUID.randomUUID().toString());
        data.put("noticeKey", "test");
        data.put("title", "Oferta de teste do Express");
        data.put("body", "Segatto → Jequitibá");
        data.put("owner", owner);
        data.put("channelId", channelId);
        data.put("expiresAt", Long.toString(System.currentTimeMillis() + 60000));
        new Handler(Looper.getMainLooper()).postDelayed(() -> show(context, data), 5000);
        return true;
    }

    static synchronized void bind(Context context, String owner) {
        SharedPreferences prefs = state(context);
        if (owner.equals(prefs.getString(OWNER, ""))) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        for (String key : prefs.getAll().keySet()) {
            if (key.startsWith("offer:")) manager.cancel(key, NOTIFICATION_ID);
        }
        prefs.edit().clear().putString(OWNER, owner).apply();
    }

    private static JSONObject read(Context context, String tag) {
        try {
            return new JSONObject(state(context).getString(tag, "{}"));
        } catch (JSONException invalid) {
            return new JSONObject();
        }
    }

    private static String channel(Context context, String channelId) {
        if (!OFFER_CHANNEL.equals(channelId) && !REMINDER_CHANNEL.equals(channelId)) channelId = ORDER_CHANNEL;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager.getNotificationChannel(channelId) != null) return channelId;
            channelId = ORDER_CHANNEL;
            if (manager.getNotificationChannel(ORDER_CHANNEL) == null) {
                NotificationChannel fallback = new NotificationChannel(ORDER_CHANNEL, "Novos pedidos", NotificationManager.IMPORTANCE_HIGH);
                fallback.enableVibration(true);
                manager.createNotificationChannel(fallback);
            }
        }
        return channelId;
    }

    static synchronized void show(Context context, Map<String, String> payload) {
        String uid = payload.get("owner");
        if (uid == null || uid.isEmpty() || !uid.equals(state(context).getString(OWNER, "")) ||
            !NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        JSONObject notice = new JSONObject(payload);
        String key = notice.optString("noticeKey");
        boolean test = "test".equals(key);
        String order = test ? "test-" + notice.optString("notificationId") : notice.optString("orderId");
        if (!order.matches("[A-Za-z0-9_-]{1,128}")) return;
        long now = System.currentTimeMillis();
        long remaining = notice.optLong("expiresAt") - now;
        if (remaining <= 0 || remaining > 600000 || !(test || key.matches("(public|favorite|round):[0-9:]+"))) return;
        String tag = "offer:" + order;
        JSONObject previous = read(context, tag);
        if (previous.optString("noticeKey").equals(key) &&
            (previous.optBoolean("dismissed") || previous.optString("notificationId").equals(notice.optString("notificationId")))) return;
        String ticket = UUID.randomUUID().toString();
        try {
            notice.put("ticket", ticket);
            SharedPreferences.Editor editor = state(context).edit();
            for (String existing : state(context).getAll().keySet()) {
                if (existing.startsWith("offer:") && read(context, existing).optLong("expiresAt") < now - 86400000L) {
                    editor.remove(existing);
                }
            }
            editor.putString(tag, notice.toString()).apply();
        } catch (JSONException invalid) {
            return;
        }
        String androidChannel = channel(context, notice.optString("channelId"));
        String title = notice.optString("title", "Nova oferta de corrida");
        String route = notice.optString("body", "Confira a oferta no Express.");
        android.app.Notification lockScreen = new NotificationCompat.Builder(context, androidChannel)
            .setContentTitle(title)
            .setContentText("Desbloqueie para ver a rota e responder.")
            .setSmallIcon(R.drawable.ic_express_notification)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(action(context, OPEN, tag, ticket, test))
            .build();
        NotificationCompat.Builder alert = new NotificationCompat.Builder(context, androidChannel)
            .setContentTitle(title)
            .setContentText(route)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(route))
            .setSmallIcon(R.drawable.ic_express_notification)
            .setColor(0xffed1726)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(lockScreen)
            .setAutoCancel(true)
            .setTimeoutAfter(remaining)
            .setContentIntent(action(context, OPEN, tag, ticket, test))
            .addAction(0, "Aceitar", action(context, ACCEPT, tag, ticket, test))
            .addAction(0, "Recusar", action(context, DECLINE, tag, ticket, test));
        if (Build.VERSION.SDK_INT < 26) {
            alert.setSound(Uri.parse("android.resource://" + context.getPackageName() + "/raw/express_offer"));
            alert.setVibrate(new long[]{0, 180, 80, 180, 80, 180});
        }
        try {
            context.getSystemService(NotificationManager.class).notify(tag, NOTIFICATION_ID, alert.build());
        } catch (SecurityException ignored) {
            // Permission was revoked after checking the current status.
        }
    }

    private static PendingIntent action(Context context, String verb, String tag, String ticket, boolean test) {
        boolean receiver = DECLINE.equals(verb) || test && ACCEPT.equals(verb);
        Intent intent = new Intent(context, receiver ? ExpressOfferResponseReceiver.class : MainActivity.class)
            .setAction(verb).setData(Uri.parse("express://offer/" + ticket))
            .putExtra("offerTag", tag).putExtra("offerTicket", ticket);
        if (receiver) return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_IMMUTABLE);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE);
    }

    static synchronized JSONObject matching(Context context, Intent intent) {
        if (intent == null) return null;
        String tag = intent.getStringExtra("offerTag");
        String ticket = intent.getStringExtra("offerTicket");
        if (tag == null || !tag.startsWith("offer:") || ticket == null || ticket.length() != 36) return null;
        JSONObject notice = read(context, tag);
        return ticket.equals(notice.optString("ticket")) && !notice.optBoolean("dismissed") &&
            notice.optString("owner").equals(state(context).getString(OWNER, "")) &&
            notice.optLong("expiresAt") > System.currentTimeMillis() ? notice : null;
    }

    static synchronized void dismiss(Context context, Intent intent) {
        JSONObject notice = matching(context, intent);
        if (notice == null) return;
        String tag = intent.getStringExtra("offerTag");
        try {
            notice.put("dismissed", DECLINE.equals(intent.getAction()));
            notice.remove("ticket");
            notice.remove("declineToken");
            state(context).edit().putString(tag, notice.toString()).apply();
        } catch (JSONException ignored) {}
        context.getSystemService(NotificationManager.class).cancel(tag, NOTIFICATION_ID);
    }
}
