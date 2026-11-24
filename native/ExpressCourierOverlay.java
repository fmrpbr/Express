package com.fmrpbr.express.v2;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.ImageButton;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExpressCourierOverlay")
public class ExpressCourierOverlay extends Plugin {
    private boolean enabled;
    private boolean background;
    private boolean openRequested;
    private ImageButton button;
    private WindowManager.LayoutParams position;
    private WindowManager windows;

    @PluginMethod public void configure(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            enabled = Boolean.TRUE.equals(call.getBoolean("enabled"));
            refresh();
            call.resolve();
        });
    }

    @PluginMethod public void permission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", Settings.canDrawOverlays(getContext()));
        call.resolve(result);
    }

    @PluginMethod public void requestPermission(PluginCall call) {
        try {
            Intent settings = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(settings);
            call.resolve();
        } catch (RuntimeException ex) {
            call.reject("Permita Exibir sobre outros apps nos ajustes do Android.");
        }
    }

    @Override protected void handleOnResume() {
        background = false;
        hide();
        if (openRequested) {
            openRequested = false;
            notifyListeners("openCourier", new JSObject(), true);
        }
    }

    @Override protected void handleOnPause() {
        background = true;
        refresh();
    }

    @Override protected void handleOnDestroy() {
        hide();
    }

    private int dp(int value) {
        return Math.round(value * getContext().getResources().getDisplayMetrics().density);
    }

    private Rect screen() {
        if (Build.VERSION.SDK_INT >= 30) return windows.getMaximumWindowMetrics().getBounds();
        android.util.DisplayMetrics metrics = new android.util.DisplayMetrics();
        windows.getDefaultDisplay().getRealMetrics(metrics);
        return new Rect(0, 0, metrics.widthPixels, metrics.heightPixels);
    }

    private SharedPreferences placement() {
        return getContext().getSharedPreferences("express_courier_overlay", Context.MODE_PRIVATE);
    }

    private void refresh() {
        if (!enabled || !background || !Settings.canDrawOverlays(getContext())) {
            hide();
            return;
        }
        if (button != null) return;
        windows = (WindowManager) getContext().getSystemService(Context.WINDOW_SERVICE);
        if (windows == null) return;
        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        position = new WindowManager.LayoutParams(dp(54), dp(54), type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT);
        position.gravity = Gravity.TOP | Gravity.LEFT;
        Rect screen = screen();
        position.x = placement().getBoolean("right", true) ? screen.width() - dp(62) : dp(8);
        position.y = Math.max(dp(52), Math.min(screen.height() - dp(88), placement().getInt("y", screen.height() / 2)));

        ImageButton overlay = new ImageButton(getContext());
        overlay.setImageResource(R.mipmap.ic_launcher_round);
        overlay.setScaleType(ImageButton.ScaleType.FIT_CENTER);
        overlay.setPadding(0, 0, 0, 0);
        overlay.setBackgroundColor(android.graphics.Color.TRANSPARENT);
        overlay.setContentDescription("Abrir corridas no Express");
        overlay.setOnClickListener(view -> openCourier());
        overlay.setOnTouchListener(new View.OnTouchListener() {
            private final int slop = ViewConfiguration.get(getContext()).getScaledTouchSlop();
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
        try {
            windows.addView(overlay, position);
            button = overlay;
        } catch (SecurityException | WindowManager.BadTokenException ignored) {
            // Permission can change while the app is switching to the background.
        }
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
        openRequested = true;
        Intent intent = new Intent(getActivity(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            getActivity().startActivity(intent);
        } catch (SecurityException ignored) {
            openRequested = false;
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
