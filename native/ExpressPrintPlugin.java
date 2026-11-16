package com.fmrpbr.express.v2;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="ExpressPrint")
public class ExpressPrintPlugin extends Plugin {
    private WebView printView;
    @PluginMethod public void print(PluginCall call) {
        String html = call.getString("html");
        String title = call.getString("title", "Pedido Express");
        if (html == null || html.length() > 100000) { call.reject("Pedido inválido."); return; }
        getActivity().runOnUiThread(() -> {
            try {
                if (printView != null) printView.destroy();
                printView = new WebView(getContext());
                printView.getSettings().setJavaScriptEnabled(false);
                printView.getSettings().setAllowFileAccess(false);
                printView.getSettings().setAllowContentAccess(false);
                printView.getSettings().setBlockNetworkLoads(true);
                printView.setWebViewClient(new WebViewClient() {
                    private boolean started;
                    @Override public void onPageFinished(WebView view, String url) {
                        if (started) return;
                        started = true;
                        try {
                            PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                            manager.print(title, view.createPrintDocumentAdapter(title), new PrintAttributes.Builder().build());
                            call.resolve();
                        } catch (Exception error) { call.reject("Não foi possível abrir a impressão."); }
                    }
                });
                printView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            } catch (Exception error) { call.reject("Não foi possível preparar a impressão."); }
        });
    }
    @Override protected void handleOnDestroy() {
        if (printView != null) { printView.destroy(); printView = null; }
    }
}
