package com.longyuye.mdreader.storagefixture;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Offline WebView control, never loads LongEdit data or a native bridge. */
public final class AccessibilityControlActivity extends Activity {
    public static final String TITLE = "LongEdit AX control";
    private WebView web;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT != 29 || !(Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish"))) { finish(); return; }
        String mode = getIntent().getStringExtra("mode");
        if (mode == null) mode = "plain";
        if (!mode.matches("plain|contents|reader|reader-contents|navigation|navigation-contents|busy|busy-contents|frontend|frontend-inspect")) { finish(); return; }
        setTitle(TITLE);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        TextView heading = new TextView(this);
        heading.setText("AX control: " + mode);
        heading.setTextSize(18);
        layout.addView(heading);
        Button reset = new Button(this);
        reset.setText("Reset control");
        reset.setOnClickListener(view -> recreate());
        layout.addView(reset);
        // An explicit diagnostic mode only. Take native snapshots before attaching
        // DevTools: asking Chromium for its AX tree can itself change observation.
        WebView.setWebContentsDebuggingEnabled(mode.equals("frontend-inspect"));
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setBlockNetworkLoads(true);
        layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout);
        if (mode.startsWith("frontend")) {
            web.getSettings().setDomStorageEnabled(true);
            web.getSettings().setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);
            web.setWebViewClient(new WebViewClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    String path = request.getUrl().getPath();
                    if ("https".equals(request.getUrl().getScheme()) && "control.invalid".equals(request.getUrl().getHost()) && path != null && !path.contains("..") && path.startsWith("/")) {
                        try {
                            String mime = path.endsWith(".js") || path.endsWith(".mjs") ? "application/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".html") ? "text/html" : "application/octet-stream";
                            return new WebResourceResponse(mime, "UTF-8", 200, "OK", java.util.Collections.singletonMap("Cache-Control", "no-store"), getAssets().open("control-web" + path));
                        } catch (java.io.IOException missing) { /* Return a local 404 below. */ }
                    }
                    return new WebResourceResponse("text/plain", "UTF-8", 404, "Offline control only", java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0]));
                }
            });
            web.loadUrl("https://control.invalid/mobile.html");
            return;
        }
        try (java.io.InputStream input = getAssets().open("a11y-control.html")) {
            java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
            byte[] chunk = new byte[4096]; int read;
            while ((read = input.read(chunk)) != -1) buffer.write(chunk, 0, read);
            String html = new String(buffer.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
            web.loadDataWithBaseURL("https://example.invalid/", html.replace("CONTROL_MODE", mode), "text/html", "UTF-8", null);
        } catch (java.io.IOException error) { throw new IllegalStateException(error); }
    }
    @Override protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
