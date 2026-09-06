package com.anixapp.tv;

import android.app.ActivityManager;
import android.app.Application;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.util.DisplayMetrics;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

public class AnixDeviceBridge {
    private final Context context;

    public AnixDeviceBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    @android.webkit.JavascriptInterface
    public String getDiagnostics() {
        try {
            JSONObject out = new JSONObject();
            out.put("manufacturer", Build.MANUFACTURER);
            out.put("brand", Build.BRAND);
            out.put("model", Build.MODEL);
            out.put("device", Build.DEVICE);
            out.put("product", Build.PRODUCT);
            out.put("hardware", Build.HARDWARE);
            out.put("board", Build.BOARD);
            out.put("androidRelease", Build.VERSION.RELEASE);
            out.put("sdkInt", Build.VERSION.SDK_INT);

            JSONArray abis = new JSONArray();
            if (Build.SUPPORTED_ABIS != null) {
                for (String abi : Build.SUPPORTED_ABIS) {
                    abis.put(abi);
                }
            }
            out.put("supportedAbis", abis);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                out.put("processName", Application.getProcessName());
            } else {
                out.put("processName", context.getPackageName());
            }

            DisplayMetrics metrics = context.getResources().getDisplayMetrics();
            out.put("screenWidthPx", metrics.widthPixels);
            out.put("screenHeightPx", metrics.heightPixels);
            out.put("densityDpi", metrics.densityDpi);
            out.put("density", metrics.density);

            ActivityManager activityManager =
                    (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (activityManager != null) {
                out.put("memoryClassMb", activityManager.getMemoryClass());
                out.put("largeMemoryClassMb", activityManager.getLargeMemoryClass());
                out.put("lowRamDevice", activityManager.isLowRamDevice());
            }

            out.put("gpuFlagsApplied", WebGpuWebViewBootstrap.wereSwitchesApplied());
            String gpuError = WebGpuWebViewBootstrap.getLastError();
            if (!gpuError.isEmpty()) {
                out.put("gpuFlagsError", gpuError);
            }

            try {
                Class<?> zygoteClass = Class.forName("android.webkit.WebViewZygote");
                Object multiprocess = zygoteClass.getMethod("isMultiprocessEnabled").invoke(null);
                out.put("webViewMultiprocess", multiprocess);
            } catch (Throwable ignored) {
                out.put("webViewMultiprocess", JSONObject.NULL);
            }

            PackageInfo webViewPackage = WebView.getCurrentWebViewPackage();
            if (webViewPackage != null) {
                out.put("webViewPackage", webViewPackage.packageName);
                out.put("webViewVersion", webViewPackage.versionName);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    out.put("webViewVersionCode", webViewPackage.getLongVersionCode());
                } else {
                    out.put("webViewVersionCode", webViewPackage.versionCode);
                }
            } else {
                out.put("webViewPackage", JSONObject.NULL);
            }

            return out.toString();
        } catch (Throwable error) {
            try {
                JSONObject err = new JSONObject();
                err.put("error", error.getMessage());
                return err.toString();
            } catch (Throwable nested) {
                return "{\"error\":\"diagnostics failed\"}";
            }
        }
    }
}
