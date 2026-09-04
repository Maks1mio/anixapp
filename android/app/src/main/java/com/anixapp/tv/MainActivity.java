package com.anixapp.tv;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private AnixTvLanBridge lanBridge;

    @Override
    protected void attachBaseContext(android.content.Context base) {
        WebGpuWebViewBootstrap.applyEarly(base);
        super.attachBaseContext(base);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        WebGpuWebViewBootstrap.applyEarly(this);
        super.onCreate(savedInstanceState);
        if (getBridge() == null) return;

        getBridge().setWebViewClient(new CdnBridgeWebViewClient(getBridge()));

        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        // HARDWARE layer on WebView composites <video> as a black surface on many TVs.
        webView.setLayerType(View.LAYER_TYPE_NONE, null);
        WebSettings settings = webView.getSettings();
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setNeedInitialFocus(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setOffscreenPreRaster(true);
        lanBridge = new AnixTvLanBridge(this, webView);
        webView.addJavascriptInterface(lanBridge, "AnixTvLan");
        webView.addJavascriptInterface(new AnixDeviceBridge(this), "AnixDevice");
    }

    @Override
    public void onDestroy() {
        if (lanBridge != null) lanBridge.stop();
        super.onDestroy();
    }
}
