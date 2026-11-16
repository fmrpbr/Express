package com.fmrpbr.express.v2;

import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static boolean diagnosticsInstalled;
    @Override
    public void onCreate(Bundle state) {
        SharedPreferences prefs = getSharedPreferences("express_diagnostics", MODE_PRIVATE);
        if (!diagnosticsInstalled) {
        diagnosticsInstalled = true;
        Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                StringBuilder report = new StringBuilder("Express 2.0.3 / Android ")
                    .append(android.os.Build.VERSION.SDK_INT).append('\n');
                // No exception messages, arguments, locations, identifiers or tokens.
                int causes = 0;
                for (Throwable cause = error; cause != null && causes++ < 4; cause = cause.getCause()) {
                    report.append(cause.getClass().getName()).append('\n');
                    int frames = 0;
                    for (StackTraceElement frame : cause.getStackTrace()) {
                        if (frames++ >= 8) break;
                        report.append(frame.getClassName()).append('.').append(frame.getMethodName())
                            .append(':').append(frame.getLineNumber()).append('\n');
                    }
                }
                prefs.edit().putString("last_crash", report.toString()).commit();
            } catch (Throwable ignored) { }
            if (previous != null) previous.uncaughtException(thread, error);
            else android.os.Process.killProcess(android.os.Process.myPid());
        });
        }
        registerPlugin(ExpressNotificationsPlugin.class);
        registerPlugin(ExpressPrintPlugin.class);
        super.onCreate(state);
        String report = prefs.getString("last_crash", null);
        if (report != null) {
            new AlertDialog.Builder(this).setTitle("Diagnóstico do fechamento")
                .setMessage(report)
                .setNeutralButton("Copiar código", (dialog, which) -> {
                    ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    clipboard.setPrimaryClip(ClipData.newPlainText("Express diagnóstico", report));
                })
                .setPositiveButton("Fechar", (dialog, which) -> prefs.edit().remove("last_crash").apply())
                .show();
        }
    }
}
