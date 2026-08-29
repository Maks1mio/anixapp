package com.anixapp.tv;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private AnixTvLanBridge lanBridge;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() == null) return;

        getBridge().setWebViewClient(new CdnBridgeWebViewClient(getBridge()));

        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        WebSettings settings = webView.getSettings();
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setNeedInitialFocus(false);
        lanBridge = new AnixTvLanBridge(this, webView);
        webView.addJavascriptInterface(lanBridge, "AnixTvLan");
    }

    @Override
    public void onDestroy() {
        if (lanBridge != null) lanBridge.stop();
        super.onDestroy();
    }
}
