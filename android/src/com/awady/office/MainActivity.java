package com.awady.office;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import org.json.JSONObject;

/**
 * Hosts the office GUI. The web app is bundled in assets/www and served from
 * https://appassets.androidplatform.net/ so it runs in a secure origin with
 * working localStorage and ES modules.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    private static final String BG = "#0f1115";
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.parseColor(BG));
        getWindow().setNavigationBarColor(Color.parseColor(BG));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor(BG));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.addJavascriptInterface(new Bridge(), "HermesApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri url = req.getUrl();
                return HOST.equals(url.getHost()) ? asset(url.getPath()) : null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri url = req.getUrl();
                if (HOST.equals(url.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (Exception ignored) {
                }
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("https://" + HOST + "/index.html" + hashFor(getIntent()));

        Updater.check(this, false);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String hash = hashFor(intent);
        if (!hash.isEmpty() && web != null) {
            web.evaluateJavascript("location.hash=" + JSONObject.quote(hash.substring(1)), null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        Updater.resumePendingInstall(this);
    }

    /** awadyoffice://open?bot=<id> opens that bot's page. */
    private static String hashFor(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"awadyoffice".equals(data.getScheme())) return "";
        String bot = data.getQueryParameter("bot");
        return bot == null || bot.isEmpty() ? "" : "#bot/" + Uri.encode(bot);
    }

    private WebResourceResponse asset(String path) {
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        String file = "www" + path;
        try {
            InputStream in = getAssets().open(file);
            return new WebResourceResponse(mime(file), "utf-8", in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", Collections.<String, String>emptyMap(), null);
        }
    }

    private static String mime(String f) {
        if (f.endsWith(".html")) return "text/html";
        if (f.endsWith(".js")) return "text/javascript";
        if (f.endsWith(".css")) return "text/css";
        if (f.endsWith(".svg")) return "image/svg+xml";
        if (f.endsWith(".png")) return "image/png";
        if (f.endsWith(".woff2")) return "font/woff2";
        if (f.endsWith(".json")) return "application/json";
        if (f.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("window.hermesBack ? window.hermesBack() : false", value -> {
            if (!"true".equals(value)) finish();
        });
    }

    /** window.HermesApp in the page. */
    private class Bridge {
        @JavascriptInterface
        public String appVersion() {
            return Updater.versionName(MainActivity.this) + " (" + Updater.versionCode(MainActivity.this) + ")";
        }

        @JavascriptInterface
        public void checkForUpdate() {
            runOnUiThread(() -> Updater.check(MainActivity.this, true));
        }

        @JavascriptInterface
        public void setActiveBot(String id) {
            // kept for the bridge link; nothing to do until notifications come back
        }

        @JavascriptInterface
        public void markRead(String id) {
        }
    }
}
