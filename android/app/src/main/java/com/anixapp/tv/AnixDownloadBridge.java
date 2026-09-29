package com.anixapp.tv;

import android.content.Context;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.ref.WeakReference;

/**
 * window.AnixDownloads — загрузки на телефоне для src/native/phone-downloads.ts.
 * Методы синхронные и быстрые (вся сеть — в потоках AnixDownloadManager),
 * аргументы и ответы — JSON-строки.
 */
public class AnixDownloadBridge {
    private final AnixDownloadManager manager;

    public AnixDownloadBridge(Context context, WebView webView) {
        this.manager = AnixDownloadManager.get(context);
        final WeakReference<WebView> ref = new WeakReference<>(webView);
        manager.setEmitter(payload -> {
            final WebView view = ref.get();
            if (view == null) return;
            // U+2028/2029 допустимы в JSON, но ломают JS-литерал.
            final String json = payload.toString().replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
            view.post(() -> view.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('episode-download:progress',{detail:" + json + "}))",
                null));
        });
    }

    private static String ok(boolean value) {
        return "{\"ok\":" + value + "}";
    }

    private static JSONArray array(String json) {
        try {
            return new JSONArray(json);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static JSONObject object(String json) {
        if (json == null || json.isEmpty() || "null".equals(json)) return null;
        try {
            return new JSONObject(json);
        } catch (Exception e) {
            return null;
        }
    }

    @JavascriptInterface
    public String enqueue(String itemsJson) {
        return manager.enqueue(array(itemsJson)).toString();
    }

    @JavascriptInterface
    public String list() {
        return manager.listQueue().toString();
    }

    @JavascriptInterface
    public String pause(String id) {
        return ok(manager.pause(id));
    }

    @JavascriptInterface
    public String pauseAll() {
        return "{\"ok\":true,\"paused\":" + manager.pauseAll() + "}";
    }

    @JavascriptInterface
    public String resume(String id) {
        return ok(manager.resume(id));
    }

    @JavascriptInterface
    public String resumeAll() {
        return "{\"ok\":true,\"resumed\":" + manager.resumeAll() + "}";
    }

    @JavascriptInterface
    public String retry(String id, String url, String headersJson) {
        return ok(manager.retry(id, url, object(headersJson)));
    }

    @JavascriptInterface
    public String cancel(String id) {
        return ok(manager.cancel(id));
    }

    @JavascriptInterface
    public String cancelAll() {
        return "{\"ok\":true,\"cancelled\":" + manager.cancelAll() + "}";
    }

    @JavascriptInterface
    public String remove(String id) {
        return ok(manager.remove(id));
    }

    @JavascriptInterface
    public String reorder(String idsJson) {
        manager.reorder(array(idsJson));
        return ok(true);
    }

    @JavascriptInterface
    public String library() {
        return manager.listLibrary().toString();
    }

    @JavascriptInterface
    public String byRelease(String releaseId) {
        long id;
        try {
            id = Long.parseLong(releaseId);
        } catch (NumberFormatException e) {
            return "[]";
        }
        return manager.listByRelease(id).toString();
    }

    @JavascriptInterface
    public String check(String itemsJson) {
        return manager.checkFiles(array(itemsJson)).toString();
    }

    @JavascriptInterface
    public String deleteFile(String path) {
        return ok(manager.deleteFile(path));
    }

    @JavascriptInterface
    public String deleteGroup(String name) {
        return ok(manager.deleteGroup(name));
    }

    @JavascriptInterface
    public String getSettings() {
        return manager.getSettings().toString();
    }

    @JavascriptInterface
    public String saveSettings(String patchJson) {
        JSONObject patch = object(patchJson);
        return manager.saveSettings(patch != null ? patch : new JSONObject()).toString();
    }

    @JavascriptInterface
    public String readSkip(String path) {
        JSONObject skip = manager.readSkip(path);
        return skip != null ? skip.toString() : "null";
    }

    @JavascriptInterface
    public String saveSkip(String path, String skipJson) {
        return ok(manager.saveSkip(path, object(skipJson)));
    }
}
