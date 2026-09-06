package com.anixapp.tv;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Anixart CDN режет картинки без Referer. Electron делает это через anix-cdn://,
 * в WebView перехватываем запрос и подставляем заголовки сайта.
 */
public class CdnBridgeWebViewClient extends BridgeWebViewClient {
    private static final String REFERER = "https://anixart.tv/";
    private static final String ORIGIN = "https://anixart.tv";
    private static final String UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    private static final String[] CDN_HOSTS = { "anixmirai.com", "anixsekai.com", "static.anixart.tv" };
    private static final String[] VIDEO_HOSTS = {
        "kodikplayer.com", "kodik-cdn.com", "kodik-storage.com", "solodcdn.com", "zerocdn.com",
        "aniqit.com", "anixis.com", "aniqart.com", "animedia.tv",
        "cache.libria.fun", "libria.fun", "anilibria.tv", "anilibria.top", "aniliberty.top",
        "sibnet.ru", "vkuservideo.net", "okcdn.ru", "userapi.com", "mycdn.me"
    };
    private static final String KODIK_REFERER = "https://kodikplayer.com/";
    private static final int CACHE_MAX = 96;

    private static final Map<String, Cached> CACHE = new LinkedHashMap<String, Cached>(CACHE_MAX, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Cached> eldest) {
            return size() > CACHE_MAX;
        }
    };

    private static class Cached {
        final String mime;
        final byte[] body;

        Cached(String mime, byte[] body) {
            this.mime = mime;
            this.body = body;
        }
    }

    public CdnBridgeWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (uri == null || !"GET".equalsIgnoreCase(request.getMethod())) {
            return super.shouldInterceptRequest(view, request);
        }
        if (isVideoHost(uri.getHost()) && looksLikeMedia(uri)) {
            WebResourceResponse media = fetchMediaStream(request);
            if (media != null) return media;
        }
        if (isCdnHost(uri.getHost()) && looksLikeImage(uri)) {
            WebResourceResponse proxied = fetchCdn(uri.toString());
            if (proxied != null) return proxied;
        }
        return super.shouldInterceptRequest(view, request);
    }

    private static boolean looksLikeImage(Uri uri) {
        String path = uri.getPath();
        if (path == null) return false;
        String p = path.toLowerCase(Locale.ROOT);
        return p.contains("/posters/")
            || p.contains("/screenshots/")
            || p.contains("/collections/")
            || p.contains("/avatars/")
            || p.endsWith(".jpg")
            || p.endsWith(".jpeg")
            || p.endsWith(".png")
            || p.endsWith(".webp")
            || p.endsWith(".gif");
    }

    private static boolean looksLikeMedia(Uri uri) {
        String path = uri.getPath();
        if (path == null) return true;
        String p = path.toLowerCase(Locale.ROOT);
        String q = uri.getQuery() != null ? uri.getQuery().toLowerCase(Locale.ROOT) : "";
        return p.contains(":hls:")
            || p.endsWith(".m3u8")
            || p.endsWith(".ts")
            || p.endsWith(".m4s")
            || p.endsWith(".mp4")
            || p.endsWith(".mpd")
            || p.endsWith(".aac")
            || q.contains("hls")
            || p.contains("/video");
    }

    private static boolean isVideoHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        if (h.startsWith("www.")) h = h.substring(4);
        for (String video : VIDEO_HOSTS) {
            if (h.equals(video) || h.endsWith("." + video)) return true;
        }
        return h.contains("solodcdn") || h.contains("kodik") || h.contains("zerocdn");
    }

    private static String refererForVideo(String host) {
        if (host == null) return KODIK_REFERER;
        String h = host.toLowerCase(Locale.ROOT);
        if (h.contains("libria") || h.contains("anilib")) return "https://anilibria.top/";
        if (h.contains("sibnet")) return "https://video.sibnet.ru/";
        if (h.contains("vkuservideo") || h.startsWith("vkvd")) return "https://vk.com/";
        if (h.contains("okcdn") || h.contains("mycdn")) return "https://ok.ru/";
        return KODIK_REFERER;
    }

    private static WebResourceResponse fetchMediaStream(WebResourceRequest request) {
        String url = request.getUrl().toString();
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(20000);
            conn.setRequestProperty("Referer", refererForVideo(request.getUrl().getHost()));
            conn.setRequestProperty("User-Agent", UA);
            conn.setRequestProperty("Accept", "*/*");
            String range = request.getRequestHeaders() != null ? request.getRequestHeaders().get("Range") : null;
            if (range != null && !range.isEmpty()) conn.setRequestProperty("Range", range);
            int code = conn.getResponseCode();
            if (code >= 400) {
                conn.disconnect();
                return null;
            }
            String mime = conn.getContentType();
            if (mime == null || mime.isEmpty()) mime = guessMediaMime(url);
            int cut = mime.indexOf(';');
            if (cut > 0) mime = mime.substring(0, cut).trim();
            Map<String, String> headers = new HashMap<>();
            String cr = conn.getHeaderField("Content-Range");
            if (cr != null) headers.put("Content-Range", cr);
            String ar = conn.getHeaderField("Accept-Ranges");
            if (ar != null) headers.put("Accept-Ranges", ar);
            String cl = conn.getHeaderField("Content-Length");
            if (cl != null) headers.put("Content-Length", cl);
            final HttpURLConnection keep = conn;
            InputStream stream = new FilterInputStream(keep.getInputStream()) {
                @Override
                public void close() throws java.io.IOException {
                    try { super.close(); } catch (Exception ignored) {}
                    keep.disconnect();
                }
            };
            String reason = code == 206 ? "Partial Content" : "OK";
            return new WebResourceResponse(mime, "UTF-8", code, reason, headers, stream);
        } catch (Exception ignored) {
            if (conn != null) conn.disconnect();
            return null;
        }
    }

    private static String guessMediaMime(String url) {
        String lower = url.toLowerCase(Locale.ROOT);
        if (lower.contains(".m3u8") || lower.contains(":hls:")) return "application/vnd.apple.mpegurl";
        if (lower.contains(".mp4")) return "video/mp4";
        if (lower.contains(".ts")) return "video/mp2t";
        return "application/octet-stream";
    }

    private static boolean isCdnHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        if (h.startsWith("www.")) h = h.substring(4);
        for (String cdn : CDN_HOSTS) {
            if (h.equals(cdn) || h.endsWith("." + cdn)) return true;
        }
        return false;
    }

    private static WebResourceResponse fetchCdn(String url) {
        synchronized (CACHE) {
            Cached hit = CACHE.get(url);
            if (hit != null) {
                return new WebResourceResponse(hit.mime, null, new ByteArrayInputStream(hit.body));
            }
        }

        HttpURLConnection conn = null;
        try {
            conn = open(url);
            int code = conn.getResponseCode();
            byte[] body = null;
            String mime = conn.getContentType();
            if (code < 400) {
                InputStream in = conn.getInputStream();
                body = readAll(in);
            }
            if (code >= 400 || body == null || body.length < 400) {
                String mirror = toMirror(url);
                if (mirror != null && !mirror.equals(url)) {
                    conn.disconnect();
                    conn = open(mirror);
                    code = conn.getResponseCode();
                    if (code < 400) {
                        body = readAll(conn.getInputStream());
                        mime = conn.getContentType();
                    }
                }
            }
            if (code >= 400 || body == null || body.length < 400) return null;

            if (mime == null || mime.isEmpty()) mime = guessMime(url);
            int cut = mime.indexOf(';');
            if (cut > 0) mime = mime.substring(0, cut).trim();
            if (mime.contains("text/html") || mime.contains("application/json")) return null;

            byte[] stored = body;

            synchronized (CACHE) {
                CACHE.put(url, new Cached(mime, stored));
            }
            return new WebResourceResponse(mime, null, new ByteArrayInputStream(stored));
        } catch (Exception ignored) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(12000);
        conn.setRequestProperty("Referer", REFERER);
        conn.setRequestProperty("Origin", ORIGIN);
        conn.setRequestProperty("User-Agent", UA);
        conn.setRequestProperty("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8");
        return conn;
    }

    private static String toMirror(String url) {
        try {
            URL parsed = new URL(url);
            String host = parsed.getHost();
            if (host == null) return null;
            if (host.startsWith("mirror-") || host.startsWith("mirror.")) return url;
            String[] parts = host.split("\\.");
            String next = parts.length > 2
                ? "mirror-" + parts[0] + "." + String.join(".", java.util.Arrays.copyOfRange(parts, 1, parts.length))
                : "mirror." + host;
            return new URL(parsed.getProtocol(), next, parsed.getPort(), parsed.getFile()).toString();
        } catch (Exception e) {
            return null;
        }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
        return out.toByteArray();
    }

    private static String guessMime(String url) {
        String lower = url.toLowerCase(Locale.ROOT);
        if (lower.contains(".png")) return "image/png";
        if (lower.contains(".webp")) return "image/webp";
        if (lower.contains(".gif")) return "image/gif";
        if (lower.contains(".svg")) return "image/svg+xml";
        return "image/jpeg";
    }
}
