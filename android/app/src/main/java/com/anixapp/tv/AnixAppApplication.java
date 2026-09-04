package com.anixapp.tv;

import android.app.Application;

/**
 * Applies Chromium GPU flags in every app process (main + WebView sandbox renderers).
 */
public class AnixAppApplication extends Application {
    @Override
    public void onCreate() {
        WebGpuWebViewBootstrap.applyEarly(this);
        super.onCreate();
    }
}
