package com.anixapp.tv;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.cert.CertificateException;
import java.security.cert.CertificateExpiredException;
import java.security.cert.CertificateNotYetValidException;
import java.security.cert.X509Certificate;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

/**
 * Anixart CDN режет картинки без Referer. Electron делает это через anix-cdn://,
 * в WebView перехватываем запрос и подставляем заголовки сайта.
 *
 * Дополнительно (чтобы обложки на TV грузились как на ПК):
 * - режем картинку под размер карточки по подсказкам `?w=&h=` из JS (иначе летят
 *   полноразмерные JPEG по 200+ КБ и тяжело декодятся на слабом чипе);
 * - держим дисковый кеш в cacheDir/cdn-images (переживает перезапуск приложения);
 * - отдаём Cache-Control, чтобы работал и HTTP-кеш WebView.
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
    private static final int CACHE_MAX = 128;
    /** Дисковый кеш: сколько живёт файл и сколько места занимает. */
    private static final long DISK_TTL_MS = 14L * 24 * 60 * 60 * 1000;
    private static final long DISK_MAX_BYTES = 160L * 1024 * 1024;
    private static final int JPEG_QUALITY = 85;
    /** Потолок подсказки размера: выше — уже не имеет смысла для TV-карточек. */
    private static final int MAX_HINT_PX = 1280;
    private static final String RESPONSE_CACHE_CONTROL = "public, max-age=604800";
    private static final String[] DISK_EXTS = { "jpg", "png", "webp", "gif", "avif" };

    private static final Map<String, Cached> CACHE = new LinkedHashMap<String, Cached>(CACHE_MAX, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Cached> eldest) {
            return size() > CACHE_MAX;
        }
    };

    private static File diskDir;
    private static final AtomicBoolean diskTrimStarted = new AtomicBoolean(false);

    private static class Cached {
        final String mime;
        final byte[] body;

        Cached(String mime, byte[] body) {
            this.mime = mime;
            this.body = body;
        }
    }

    private static class DiskHit {
        final String mime;
        final byte[] body;

        DiskHit(String mime, byte[] body) {
            this.mime = mime;
            this.body = body;
        }
    }

    public CdnBridgeWebViewClient(Bridge bridge) {
        super(bridge);
        try {
            Context context = bridge.getContext();
            if (context != null && diskDir == null) {
                File dir = new File(context.getCacheDir(), "cdn-images");
                if (dir.exists() || dir.mkdirs()) diskDir = dir;
            }
        } catch (Exception ignored) {
            /* кеш без диска — просто медленнее */
        }
        startDiskTrimOnce();
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
            WebResourceResponse proxied = fetchCdn(uri);
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

    private static WebResourceResponse fetchCdn(Uri uri) {
        String url = uri.toString();
        int targetW = parseHint(uri.getQueryParameter("w"));
        int targetH = parseHint(uri.getQueryParameter("h"));
        String fetchUrl = stripSizeHints(url);
        String key = fetchUrl + "|" + targetW + "x" + targetH;

        synchronized (CACHE) {
            Cached hit = CACHE.get(key);
            if (hit != null) {
                return imageResponse(hit.mime, hit.body);
            }
        }

        DiskHit diskHit = readDisk(key);
        if (diskHit != null) {
            synchronized (CACHE) {
                CACHE.put(key, new Cached(diskHit.mime, diskHit.body));
            }
            return imageResponse(diskHit.mime, diskHit.body);
        }

        String mirror = toMirror(fetchUrl);
        String[] order = (mirror != null && !mirror.equals(fetchUrl))
            ? new String[] { fetchUrl, mirror }
            : new String[] { fetchUrl };

        HttpURLConnection conn = null;
        try {
            int code = 400;
            byte[] body = null;
            String mime = null;
            for (String candidate : order) {
                if (conn != null) conn.disconnect();
                conn = open(candidate);
                code = conn.getResponseCode();
                mime = conn.getContentType();
                body = null;
                if (code < 400) {
                    body = readAll(conn.getInputStream());
                }
                if (code < 400 && body != null && body.length >= 400) {
                    break;
                }
            }
            if (code >= 400 || body == null || body.length < 400) return null;

            if (mime == null || mime.isEmpty()) mime = guessMime(fetchUrl);
            int cut = mime.indexOf(';');
            if (cut > 0) mime = mime.substring(0, cut).trim();
            if (mime.contains("text/html") || mime.contains("application/json")) return null;

            byte[] stored = body;
            String storedMime = mime;

            // Режем под запрошенный размер: на TV это разница между 200 КБ и ~40 КБ
            // на карточку (как делает Electron-прокси на ПК).
            if (targetW > 0 && targetH > 0) {
                byte[] resized = resizeToJpeg(body, targetW, targetH);
                if (resized != null && resized.length > 0 && resized.length < body.length) {
                    stored = resized;
                    storedMime = "image/jpeg";
                }
            }

            synchronized (CACHE) {
                CACHE.put(key, new Cached(storedMime, stored));
            }
            writeDisk(key, storedMime, stored);
            return imageResponse(storedMime, stored);
        } catch (Exception ignored) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static WebResourceResponse imageResponse(String mime, byte[] body) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", RESPONSE_CACHE_CONTROL);
        headers.put("Content-Length", String.valueOf(body.length));
        return new WebResourceResponse(mime, null, 200, "OK", headers, new ByteArrayInputStream(body));
    }

    /** Подсказка размера из query (`w`/`h`), 0 — если её нет или она мусорная. */
    private static int parseHint(String value) {
        if (value == null) return 0;
        try {
            int parsed = Integer.parseInt(value.trim());
            if (parsed <= 0) return 0;
            return Math.min(parsed, MAX_HINT_PX);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** w/h — подсказки бриджу, в CDN их не отправляем. */
    private static String stripSizeHints(String url) {
        try {
            Uri uri = Uri.parse(url);
            if (uri.getQueryParameter("w") == null && uri.getQueryParameter("h") == null) return url;
            Uri.Builder builder = uri.buildUpon().clearQuery();
            for (String name : uri.getQueryParameterNames()) {
                if ("w".equals(name) || "h".equals(name)) continue;
                for (String value : uri.getQueryParameters(name)) {
                    builder.appendQueryParameter(name, value);
                }
            }
            return builder.build().toString();
        } catch (Exception e) {
            return url;
        }
    }

    /** Уменьшает картинку под размер карточки и пережимает в JPEG. */
    private static byte[] resizeToJpeg(byte[] src, int targetW, int targetH) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(src, 0, src.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;

            int sample = 1;
            while (bounds.outWidth / (sample * 2) >= targetW && bounds.outHeight / (sample * 2) >= targetH) {
                sample *= 2;
            }

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            Bitmap bitmap = BitmapFactory.decodeByteArray(src, 0, src.length, opts);
            if (bitmap == null) return null;

            float scale = Math.max((float) targetW / bitmap.getWidth(), (float) targetH / bitmap.getHeight());
            if (scale > 1f) scale = 1f;
            Bitmap out = bitmap;
            if (scale < 0.995f) {
                int width = Math.max(1, Math.round(bitmap.getWidth() * scale));
                int height = Math.max(1, Math.round(bitmap.getHeight() * scale));
                out = Bitmap.createScaledBitmap(bitmap, width, height, true);
                if (out != bitmap) bitmap.recycle();
            }
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            out.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, buffer);
            out.recycle();
            return buffer.toByteArray();
        } catch (Throwable t) {
            return null;
        }
    }

    private static String extForMime(String mime) {
        if (mime == null) return "jpg";
        String m = mime.toLowerCase(Locale.ROOT);
        if (m.contains("png")) return "png";
        if (m.contains("webp")) return "webp";
        if (m.contains("gif")) return "gif";
        if (m.contains("avif")) return "avif";
        return "jpg";
    }

    private static String mimeForExt(String ext) {
        if ("png".equals(ext)) return "image/png";
        if ("webp".equals(ext)) return "image/webp";
        if ("gif".equals(ext)) return "image/gif";
        if ("avif".equals(ext)) return "image/avif";
        return "image/jpeg";
    }

    private static String sha1(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] bytes = digest.digest(value.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(value.hashCode());
        }
    }

    private static File diskFile(String key, String ext) {
        if (diskDir == null) return null;
        return new File(diskDir, sha1(key) + "." + ext);
    }

    private static DiskHit readDisk(String key) {
        if (diskDir == null) return null;
        for (String ext : DISK_EXTS) {
            File file = diskFile(key, ext);
            if (file == null || !file.isFile()) continue;
            if (System.currentTimeMillis() - file.lastModified() > DISK_TTL_MS) {
                file.delete();
                continue;
            }
            try {
                byte[] body = readFile(file);
                if (body != null && body.length > 0) {
                    file.setLastModified(System.currentTimeMillis());
                    return new DiskHit(mimeForExt(ext), body);
                }
            } catch (Exception ignored) {
                /* попробуем следующий вариант расширения */
            }
        }
        return null;
    }

    private static void writeDisk(String key, String mime, byte[] body) {
        if (diskDir == null || body == null || body.length == 0) return;
        try {
            File file = diskFile(key, extForMime(mime));
            if (file == null) return;
            // Пишем через .tmp и переименовываем: оборванный процесс не оставит битый кеш.
            File tmp = new File(file.getAbsolutePath() + ".tmp");
            FileOutputStream out = new FileOutputStream(tmp);
            try {
                out.write(body);
            } finally {
                out.close();
            }
            if (!tmp.renameTo(file)) {
                tmp.delete();
            }
        } catch (Exception ignored) {
            /* кеш — не критично */
        }
    }

    private static byte[] readFile(File file) throws Exception {
        long length = file.length();
        if (length <= 0 || length > 16L * 1024 * 1024) return null;
        byte[] out = new byte[(int) length];
        FileInputStream in = new FileInputStream(file);
        try {
            int offset = 0;
            while (offset < out.length) {
                int read = in.read(out, offset, out.length - offset);
                if (read <= 0) break;
                offset += read;
            }
            if (offset == out.length) return out;
            byte[] trimmed = new byte[offset];
            System.arraycopy(out, 0, trimmed, 0, offset);
            return trimmed;
        } finally {
            in.close();
        }
    }

    private static void startDiskTrimOnce() {
        if (!diskTrimStarted.compareAndSet(false, true)) return;
        Thread thread = new Thread(CdnBridgeWebViewClient::trimDisk);
        thread.setDaemon(true);
        thread.start();
    }

    /** Чистка дискового кеша: просроченное и лишнее по объёму (LRU по времени файла). */
    private static void trimDisk() {
        File dir = diskDir;
        if (dir == null) return;
        try {
            File[] files = dir.listFiles();
            if (files == null || files.length == 0) return;
            long now = System.currentTimeMillis();
            long total = 0;
            for (File file : files) {
                if (!file.isFile()) continue;
                if (now - file.lastModified() > DISK_TTL_MS) {
                    file.delete();
                    continue;
                }
                total += file.length();
            }
            if (total <= DISK_MAX_BYTES) return;
            Arrays.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
            for (File file : files) {
                if (total <= DISK_MAX_BYTES) break;
                if (!file.isFile()) continue;
                long size = file.length();
                if (file.delete()) total -= size;
            }
        } catch (Exception ignored) {
            /* не мешаем работе */
        }
    }

    private static volatile SSLSocketFactory cdnSslFactory;

    private static X509TrustManager systemTrustManager() throws Exception {
        TrustManagerFactory factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        factory.init((KeyStore) null);
        for (TrustManager tm : factory.getTrustManagers()) {
            if (tm instanceof X509TrustManager) return (X509TrustManager) tm;
        }
        throw new IllegalStateException("no X509TrustManager");
    }

    private static boolean isDateOnlyCertFailure(Throwable error) {
        for (Throwable cur = error; cur != null; cur = cur.getCause()) {
            if (cur instanceof CertificateExpiredException || cur instanceof CertificateNotYetValidException) {
                return true;
            }
            String msg = cur.getMessage();
            if (msg == null) continue;
            String lower = msg.toLowerCase(Locale.ROOT);
            if (lower.contains("expired") || lower.contains("notyetvalid") || lower.contains("not yet valid")) {
                return true;
            }
        }
        return false;
    }

    private static SSLSocketFactory cdnSslFactory() {
        SSLSocketFactory cached = cdnSslFactory;
        if (cached != null) return cached;
        synchronized (CdnBridgeWebViewClient.class) {
            if (cdnSslFactory != null) return cdnSslFactory;
            try {
                final X509TrustManager system = systemTrustManager();
                TrustManager wrapping = new X509TrustManager() {
                    @Override
                    public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                        system.checkClientTrusted(chain, authType);
                    }

                    @Override
                    public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                        try {
                            system.checkServerTrusted(chain, authType);
                        } catch (CertificateException e) {
                            if (!isDateOnlyCertFailure(e)) throw e;
                        }
                    }

                    @Override
                    public X509Certificate[] getAcceptedIssuers() {
                        return system.getAcceptedIssuers();
                    }
                };
                SSLContext ctx = SSLContext.getInstance("TLS");
                ctx.init(null, new TrustManager[] { wrapping }, null);
                cdnSslFactory = ctx.getSocketFactory();
            } catch (Exception e) {
                cdnSslFactory = HttpsURLConnection.getDefaultSSLSocketFactory();
            }
            return cdnSslFactory;
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(12000);
        if (conn instanceof HttpsURLConnection) {
            ((HttpsURLConnection) conn).setSSLSocketFactory(cdnSslFactory());
        }
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
