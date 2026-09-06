package com.anixapp.tv;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;

public class AnixTvLanBridge {
    private final LanLoginServer server;

    public AnixTvLanBridge(android.content.Context context, WebView webView) {
        this.server = new LanLoginServer(context, webView);
    }

    @JavascriptInterface
    public String start() {
        return server.start();
    }

    @JavascriptInterface
    public void stop() {
        server.stop();
    }

    @JavascriptInterface
    public String getUrl() {
        String url = server.getUrl();
        return url == null ? "" : url;
    }
}
