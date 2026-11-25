package com.fmrpbr.express.v2;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExpressCourierOverlay")
public class ExpressCourierOverlay extends Plugin {
    private static boolean openRequested;
    private boolean enabled;
    private boolean foreground = true;

    static void requestCourierView(boolean open) { openRequested = open; }

    @PluginMethod public void configure(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            enabled = Boolean.TRUE.equals(call.getBoolean("enabled"));
            ExpressCourierOverlayService.reconcile(getContext(), enabled, foreground);
            call.resolve();
        });
    }

    @PluginMethod public void permission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", Settings.canDrawOverlays(getContext()));
        result.put("running", ExpressCourierOverlayService.isRunning());
        result.put("error", ExpressCourierOverlayService.error());
        call.resolve(result);
    }

    @PluginMethod public void requestPermission(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())));
            call.resolve();
        } catch (RuntimeException ignored) {
            call.reject("Permita Exibir sobre outros apps nos ajustes do Android.");
        }
    }

    @Override protected void handleOnResume() {
        foreground = true;
        ExpressCourierOverlayService.reconcile(getContext(), enabled, true);
        if (openRequested) {
            openRequested = false;
            notifyListeners("openCourier", new JSObject(), true);
        }
    }

    @Override protected void handleOnStop() {
        foreground = false;
        ExpressCourierOverlayService.reconcile(getContext(), enabled, false);
    }
}
