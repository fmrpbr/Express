package com.fmrpbr.express.v2;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class ExpressOfferMessagingService extends MessagingService {
    @Override public void onMessageReceived(@NonNull RemoteMessage message) {
        if ("android-actions-v1".equals(message.getData().get("offerMode"))) {
            ExpressOfferNotice.show(this, message.getData());
        } else {
            super.onMessageReceived(message);
        }
    }
}
