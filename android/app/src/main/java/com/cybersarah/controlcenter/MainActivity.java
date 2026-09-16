package com.cybersarah.controlcenter;

import android.os.Bundle;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Fix (Sprint 130): "Weisser Bildschirm, App schliesst sich" beim Tippen
 * im Superagent-Tab.
 *
 * Ursache: CyberSarah ist eine Capacitor-App (Web-Export in einer Android-
 * WebView). Ohne WebViewClient-Override fuehrt ein Absturz des WebView-
 * Renderer-Prozesses (haeufig bei Speicherdruck durch viele gleichzeitige
 * Re-Renders + Glow-/Blur-Overlays waehrend Tastatureingabe) automatisch
 * zum Absturz der gesamten App — Android liefert dafuer keinen Default-
 * Recovery-Pfad. Dieser Override faengt onRenderProcessGone() ab und laedt
 * die WebView neu, statt die App zu beenden.
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "CyberSarahMain";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        this.getBridge().getWebView().setWebViewClient(new BridgeWebViewClient(this.getBridge()) {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                Log.e(TAG, "WebView-Renderer abgestuerzt (didCrash=" + detail.didCrash() + ") — lade neu statt App zu beenden.");

                if (view != null) {
                    view.destroy();
                }

                // WebView-Renderer neu aufbauen, statt die Activity/App zu beenden.
                recreate();
                return true;
            }
        });
    }
}
