package com.anixapp.tv;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.File;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Раздача скачанных серий в WebView без сети (аналог anix-local:// в Electron).
 *
 * URL: https://localhost/__anix_local__/<абсолютный путь>. Путь, а не query,
 * чтобы относительные сегменты в index.m3u8 разрешались в ту же папку.
 * Отдаются только файлы внутри каталога загрузок; поддерживается Range для перемотки.
 */
final class AnixLocalMedia {
    static final String PREFIX = "/__anix_local__";

    private AnixLocalMedia() {}

    static boolean matches(Uri uri) {
        String path = uri.getPath();
        return path != null && path.startsWith(PREFIX + "/")
            && ("localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost()));
    }

    static WebResourceResponse serve(WebResourceRequest request) {
        String path = request.getUrl().getPath();
        if (path == null) return notFound();
        File file = new File(path.substring(PREFIX.length()));
        File root = AnixDownloadManager.rootOrNull();
        if (root == null || !file.isFile() || !isInside(root, file)) return notFound();

        long length = file.length();
        long start = 0;
        long end = length - 1;
        boolean partial = false;
        Map<String, String> reqHeaders = request.getRequestHeaders();
        String range = reqHeaders != null ? headerIgnoreCase(reqHeaders, "Range") : null;
        if (range != null && range.startsWith("bytes=") && length > 0) {
            String spec = range.substring(6).split(",")[0].trim();
            int dash = spec.indexOf('-');
            try {
                if (dash == 0) {
                    long suffix = Long.parseLong(spec.substring(1));
                    start = Math.max(0, length - suffix);
                } else if (dash > 0) {
                    start = Long.parseLong(spec.substring(0, dash));
                    String tail = spec.substring(dash + 1);
                    if (!tail.isEmpty()) end = Math.min(end, Long.parseLong(tail));
                }
                partial = true;
            } catch (NumberFormatException ignored) {
                start = 0;
                end = length - 1;
            }
            if (start > end || start >= length) {
                Map<String, String> h = baseHeaders();
                h.put("Content-Range", "bytes */" + length);
                return new WebResourceResponse(mimeFor(file.getName()), null, 416, "Range Not Satisfiable", h, emptyStream());
            }
        }

        try {
            final long count = end - start + 1;
            FileInputStream fis = new FileInputStream(file);
            long skipped = 0;
            while (skipped < start) {
                long s = fis.skip(start - skipped);
                if (s <= 0) break;
                skipped += s;
            }
            InputStream body = new FilterInputStream(fis) {
                private long left = count;

                @Override
                public int read() throws IOException {
                    if (left <= 0) return -1;
                    int b = super.read();
                    if (b >= 0) left--;
                    return b;
                }

                @Override
                public int read(byte[] buf, int off, int len) throws IOException {
                    if (left <= 0) return -1;
                    int r = super.read(buf, off, (int) Math.min(len, left));
                    if (r > 0) left -= r;
                    return r;
                }
            };
            Map<String, String> headers = baseHeaders();
            headers.put("Content-Length", String.valueOf(count));
            if (partial) headers.put("Content-Range", "bytes " + start + "-" + end + "/" + length);
            return new WebResourceResponse(
                mimeFor(file.getName()), null,
                partial ? 206 : 200, partial ? "Partial Content" : "OK",
                headers, body);
        } catch (IOException e) {
            return notFound();
        }
    }

    private static boolean isInside(File root, File file) {
        try {
            return file.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator);
        } catch (IOException e) {
            return false;
        }
    }

    private static String headerIgnoreCase(Map<String, String> headers, String name) {
        for (Map.Entry<String, String> e : headers.entrySet()) {
            if (name.equalsIgnoreCase(e.getKey())) return e.getValue();
        }
        return null;
    }

    private static Map<String, String> baseHeaders() {
        Map<String, String> h = new HashMap<>();
        h.put("Accept-Ranges", "bytes");
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", "no-cache");
        return h;
    }

    private static InputStream emptyStream() {
        return new java.io.ByteArrayInputStream(new byte[0]);
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", baseHeaders(), emptyStream());
    }

    static String mimeFor(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
        if (n.endsWith(".ts")) return "video/mp2t";
        if (n.endsWith(".mp4") || n.endsWith(".m4s")) return "video/mp4";
        if (n.endsWith(".m4a")) return "audio/mp4";
        if (n.endsWith(".aac")) return "audio/aac";
        return "application/octet-stream";
    }
}
