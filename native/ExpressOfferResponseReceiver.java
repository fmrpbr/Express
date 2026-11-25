package com.fmrpbr.express.v2;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class ExpressOfferResponseReceiver extends BroadcastReceiver {
    private static final String DECLINE_URL =
        "https://southamerica-east1-express-entregas-2-testes.cloudfunctions.net/declineAndroidOffer";

    @Override public void onReceive(Context context, Intent intent) {
        JSONObject notice = ExpressOfferNotice.matching(context, intent);
        if (notice == null) return;
        boolean test = "test".equals(notice.optString("noticeKey"));
        boolean decline = ExpressOfferNotice.DECLINE.equals(intent.getAction());
        if (!decline && !test) return;
        String token = notice.optString("declineToken");
        if (test || token.isEmpty()) {
            ExpressOfferNotice.dismiss(context, intent);
            feedback(context, test ? (decline ? "Teste de recusa recebido." : "Teste de aceite recebido.") : "Oferta dispensada.");
            return;
        }
        PendingResult pending = goAsync();
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(DECLINE_URL).openConnection();
                connection.setConnectTimeout(3500);
                connection.setReadTimeout(4500);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setDoOutput(true);
                byte[] request = new JSONObject().put("deliveryId", notice.optString("notificationId"))
                    .put("token", token).toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(request.length);
                try (java.io.OutputStream output = connection.getOutputStream()) {
                    output.write(request);
                }
                int status = connection.getResponseCode();
                if (status == 204 || status == 404 || status == 409) {
                    ExpressOfferNotice.dismiss(context, intent);
                    feedback(context, status == 204 ? "Oferta recusada." : "Esta oferta já encerrou.");
                } else feedback(context, "Recusa pendente. Tente novamente ou abra o Express.");
            } catch (Exception error) {
                feedback(context, "Recusa pendente. Tente novamente ou abra o Express.");
            } finally {
                if (connection != null) connection.disconnect();
                pending.finish();
            }
        }, "ExpressOfferDecline").start();
    }

    private static void feedback(Context context, String message) {
        new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(context, message, Toast.LENGTH_SHORT).show());
    }
}
