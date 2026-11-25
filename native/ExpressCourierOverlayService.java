package com.fmrpbr.express.v2;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.util.Log;
import android.view.Display;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.ImageButton;
import androidx.core.app.NotificationCompat;

public class ExpressCourierOverlayService extends Service {
    private static final String CHANNEL = "express_courier_overlay_v1";
    private static final int SERVICE_NOTIFICATION = 3702;
    private static ExpressCourierOverlayService active;
    private static boolean enabled;
    private static boolean appVisible = true;
    private static String error = "";
    private ImageButton button;
    private WindowManager.LayoutParams position;
    private WindowManager windows;

    static void reconcile(Context context, boolean requested, boolean visible) {
        enabled = requested;
        appVisible = visible;
        if (!enabled || !Settings.canDrawOverlays(context)) {
            if (active != null) { active.hide(); active.stopSelf(); }
            return;
        }
        if (active != null) { active.refresh(); return; }
        if (!visible) return;
        try {
            Intent service = new Intent(context, ExpressCourierOverlayService.class);
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(service);
            else context.startService(service);
        } catch (RuntimeException failure) {
            error = "O Android restringiu o início do balão. Abra o Express e tente novamente.";
            Log.w("ExpressBubble", "Service start: " + failure.getClass().getSimpleName());
        }
    }

    static boolean isRunning() { return active != null; }
    static String error() { return error; }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            Notification notification = serviceNotification();
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(SERVICE_NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else startForeground(SERVICE_NOTIFICATION, notification);
            active = this;
            error = "";
            if (!enabled || !Settings.canDrawOverlays(this)) stopSelf();
            else refresh();
        } catch (RuntimeException failure) {
            error = "O serviço do balão não iniciou.";
            Log.w("ExpressBubble", "Foreground start: " + failure.getClass().getSimpleName());
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        hide();
        if (active == this) active = null;
        super.onDestroy();
    }

    private Notification serviceNotification() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Balão do Express", NotificationManager.IMPORTANCE_LOW));
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, SERVICE_NOTIFICATION, open, PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_express_notification)
            .setContentTitle("Balão do Express ativo").setContentText("Enquanto você estiver disponível ou em corrida.")
            .setSilent(true).setOngoing(true).setContentIntent(tap).build();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private Rect screen() {
        if (Build.VERSION.SDK_INT >= 30) return windows.getMaximumWindowMetrics().getBounds();
        android.util.DisplayMetrics metrics = new android.util.DisplayMetrics();
        windows.getDefaultDisplay().getRealMetrics(metrics);
        return new Rect(0, 0, metrics.widthPixels, metrics.heightPixels);
    }

    private SharedPreferences placement() {
        return getSharedPreferences("express_courier_overlay", Context.MODE_PRIVATE);
    }

    private void refresh() {
        if (!enabled || appVisible || !Settings.canDrawOverlays(this)) {
            hide();
            return;
        }
        if (button != null) return;
        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        try {
            createBubbleWindow(type);
            error = "";
        } catch (RuntimeException failure) {
            error = "O Android impediu a janela do balão neste momento.";
            Log.w("ExpressBubble", "Overlay window: " + failure.getClass().getSimpleName());
            hide();
        }
    }

    private void createBubbleWindow(int type) {
        Context windowContext = this;
        if (Build.VERSION.SDK_INT >= 30) {
            Display display = getSystemService(DisplayManager.class).getDisplay(Display.DEFAULT_DISPLAY);
            if (display != null) windowContext = createDisplayContext(display).createWindowContext(type, null);
        }
        windows = windowContext.getSystemService(WindowManager.class);
        if (windows == null) return;
        position = new WindowManager.LayoutParams(dp(54), dp(54), type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT);
        position.gravity = Gravity.TOP | Gravity.LEFT;
        Rect screen = screen();
        position.x = placement().getBoolean("right", true) ? screen.width() - dp(62) : dp(8);
        position.y = Math.max(dp(52), Math.min(screen.height() - dp(88), placement().getInt("y", screen.height() / 2)));

        ImageButton overlay = new ImageButton(windowContext);
        overlay.setImageResource(R.mipmap.ic_launcher_round);
        overlay.setScaleType(ImageButton.ScaleType.FIT_CENTER);
        overlay.setPadding(0, 0, 0, 0);
        overlay.setBackgroundColor(android.graphics.Color.TRANSPARENT);
        overlay.setContentDescription("Abrir corridas no Express");
        overlay.setOnClickListener(view -> openCourier());
        overlay.setOnTouchListener(new View.OnTouchListener() {
            private final int slop = ViewConfiguration.get(ExpressCourierOverlayService.this).getScaledTouchSlop();
            private float startX, startY;
            private int originX, originY;
            private boolean moved;

            @Override public boolean onTouch(View view, MotionEvent event) {
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = event.getRawX();
                        startY = event.getRawY();
                        originX = position.x;
                        originY = position.y;
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = event.getRawX() - startX;
                        float dy = event.getRawY() - startY;
                        moved |= Math.abs(dx) > slop || Math.abs(dy) > slop;
                        if (moved) move(originX + Math.round(dx), originY + Math.round(dy));
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (moved) {
                            int width = screen().width();
                            boolean right = position.x + dp(27) >= width / 2;
                            move(right ? width - dp(62) : dp(8), position.y);
                            placement().edit().putBoolean("right", right).putInt("y", position.y).apply();
                        } else view.performClick();
                        return true;
                    default:
                        return true;
                }
            }
        });
        windows.addView(overlay, position);
        button = overlay;
    }

    private void move(int x, int y) {
        if (button == null) return;
        Rect screen = screen();
        position.x = Math.max(dp(8), Math.min(screen.width() - dp(62), x));
        position.y = Math.max(dp(52), Math.min(screen.height() - dp(88), y));
        try {
            windows.updateViewLayout(button, position);
        } catch (IllegalArgumentException | SecurityException ignored) {
            hide();
        }
    }

    private void openCourier() {
        ExpressCourierOverlay.requestCourierView(true);
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            startActivity(intent);
        } catch (SecurityException ignored) {
            ExpressCourierOverlay.requestCourierView(false);
        }
    }

    private void hide() {
        if (button == null) return;
        ImageButton overlay = button;
        button = null;
        if (overlay.isAttachedToWindow()) {
            try {
                windows.removeViewImmediate(overlay);
            } catch (IllegalArgumentException ignored) {
                // Android may already have detached the window during a permission change.
            }
        }
    }
}
