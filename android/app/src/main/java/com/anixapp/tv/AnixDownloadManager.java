package com.anixapp.tv;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Загрузки серий на телефоне (аналог electron/lib/download-queue.js).
 *
 * - прямой файл (Kodik/Sibnet mp4): докачка через Range в *.part;
 * - HLS (AniLibria и др.): сегменты в папку «Название 01.hls», локальный index.m3u8;
 * - очередь и библиотека в JSON в каталоге приложения, переживают перезапуск;
 * - прогресс уходит в WebView событием episode-download:progress (как IPC в Electron).
 *
 * Файлы лежат в app-specific storage (Android/data/…/files/AnixApp): разрешения
 * не нужны, воспроизведение идёт через AnixLocalMedia без сети.
 */
public final class AnixDownloadManager {
    private static final String TAG = "AnixDownloads";
    private static final String UA =
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";
    private static final int SEGMENT_THREADS = 4;
    private static final int MAX_ATTEMPTS = 4;
    private static final long MIN_FREE_BYTES = 150L * 1024 * 1024;
    private static final long EMIT_INTERVAL_MS = 400;
    static final String HLS_DIR_SUFFIX = ".hls";
    static final String HLS_INDEX = "index.m3u8";

    public interface Emitter {
        void emit(JSONObject payload);
    }

    private static volatile AnixDownloadManager instance;

    public static AnixDownloadManager get(Context context) {
        AnixDownloadManager local = instance;
        if (local != null) return local;
        synchronized (AnixDownloadManager.class) {
            if (instance == null) instance = new AnixDownloadManager(context.getApplicationContext());
            return instance;
        }
    }

    /** Корень загрузок, если менеджер уже создан (для раздачи файлов в WebView). */
    static File rootOrNull() {
        AnixDownloadManager local = instance;
        return local != null ? local.root : null;
    }

    private final File root;
    private final File stateDir;
    private final ExecutorService jobPool = Executors.newCachedThreadPool();
    private final Object lock = new Object();
    private final List<Job> queue = new ArrayList<>();
    private final JSONObject settings;
    private JSONArray library;
    private volatile Emitter emitter;

    private static final class Job {
        String id;
        String url;
        JSONObject headers = new JSONObject();
        String filename;
        String folder;
        long releaseId;
        long sourceId;
        long dubberId;
        int episodePosition = -1;
        String releaseTitle = "";
        String dubberName = "";
        String sourceName = "";
        JSONObject skip;
        String status = "queued";
        long received;
        long total;
        String error;
        String filePath;
        String kind = "";
        long lastEmit;
        volatile String stopReason;
        Future<?> future;
    }

    private static final class StopException extends IOException {
        StopException() { super("stopped"); }
    }

    private static final class HttpStatusException extends IOException {
        final int code;
        HttpStatusException(int code) {
            super("HTTP " + code);
            this.code = code;
        }
    }

    private AnixDownloadManager(Context context) {
        File base = context.getExternalFilesDir(null);
        if (base == null) base = context.getFilesDir();
        root = new File(base, "AnixApp");
        stateDir = new File(context.getFilesDir(), "downloads-state");
        //noinspection ResultOfMethodCallIgnored
        root.mkdirs();
        //noinspection ResultOfMethodCallIgnored
        stateDir.mkdirs();
        settings = readJsonObject(new File(stateDir, "settings.json"));
        library = readJsonArray(new File(stateDir, "library.json"));
        restoreQueue();
    }

    public void setEmitter(Emitter emitter) {
        this.emitter = emitter;
    }

    // ── Настройки ────────────────────────────────────────────────────────────

    public JSONObject getSettings() {
        JSONObject out = new JSONObject();
        try {
            synchronized (lock) {
                out.put("directory", root.getAbsolutePath());
                out.put("defaultDirectory", root.getAbsolutePath());
                out.put("organizeByTitle", settings.optBoolean("organizeByTitle", true));
                out.put("allAtOnce", settings.optBoolean("allAtOnce", false));
                out.put("autoClearFinished", settings.optBoolean("autoClearFinished", true));
            }
        } catch (Exception ignored) {}
        return out;
    }

    public JSONObject saveSettings(JSONObject patch) {
        synchronized (lock) {
            for (String key : new String[] { "organizeByTitle", "allAtOnce", "autoClearFinished" }) {
                if (patch.has(key)) {
                    try { settings.put(key, patch.optBoolean(key)); } catch (Exception ignored) {}
                }
            }
            writeJson(new File(stateDir, "settings.json"), settings.toString());
        }
        pump();
        JSONObject out = getSettings();
        try { out.put("ok", true); } catch (Exception ignored) {}
        return out;
    }

    // ── Очередь ──────────────────────────────────────────────────────────────

    public JSONObject enqueue(JSONArray items) {
        JSONArray added = new JSONArray();
        synchronized (lock) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.optJSONObject(i);
                if (it == null) continue;
                String url = it.optString("url", "");
                if (!url.startsWith("http")) continue;
                String filename = safeName(it.optString("filename", "episode.mp4"));
                String folder = safeFolder(it.optString("folder", ""));
                Job existing = findActiveByTarget(folder, filename);
                if (existing != null) {
                    addItem(added, existing);
                    continue;
                }
                Job job = new Job();
                job.id = "dl-" + System.currentTimeMillis() + "-" + Integer.toHexString((int) (Math.random() * 0xffffff));
                job.url = url;
                JSONObject headers = it.optJSONObject("headers");
                if (headers != null) job.headers = headers;
                job.filename = filename;
                job.folder = folder;
                job.releaseId = it.optLong("releaseId", 0);
                job.sourceId = it.optLong("sourceId", 0);
                job.dubberId = it.optLong("dubberId", 0);
                job.episodePosition = it.optInt("episodePosition", -1);
                job.releaseTitle = it.optString("releaseTitle", "");
                job.dubberName = it.optString("dubberName", "");
                job.sourceName = it.optString("sourceName", "");
                job.skip = it.optJSONObject("skip");
                queue.add(job);
                addItem(added, job);
                emit(job, true);
            }
            persistQueue();
        }
        pump();
        JSONObject out = new JSONObject();
        try {
            out.put("ok", true);
            out.put("items", added);
        } catch (Exception ignored) {}
        return out;
    }

    private static void addItem(JSONArray arr, Job job) {
        try {
            JSONObject o = new JSONObject();
            o.put("id", job.id);
            o.put("filename", job.filename);
            arr.put(o);
        } catch (Exception ignored) {}
    }

    private Job findActiveByTarget(String folder, String filename) {
        for (Job j : queue) {
            if (!j.folder.equals(folder) || !j.filename.equals(filename)) continue;
            if ("queued".equals(j.status) || "starting".equals(j.status)
                || "downloading".equals(j.status) || "paused".equals(j.status)) {
                return j;
            }
        }
        return null;
    }

    private Job find(String id) {
        for (Job j : queue) if (j.id.equals(id)) return j;
        return null;
    }

    public JSONArray listQueue() {
        JSONArray out = new JSONArray();
        synchronized (lock) {
            for (Job j : queue) out.put(toJson(j));
        }
        return out;
    }

    public boolean pause(String id) {
        synchronized (lock) {
            Job j = find(id);
            if (j == null) return false;
            if ("queued".equals(j.status)) {
                j.status = "paused";
                emit(j, true);
                persistQueue();
                return true;
            }
            if ("downloading".equals(j.status) || "starting".equals(j.status)) {
                j.stopReason = "pause";
                return true;
            }
            return false;
        }
    }

    public int pauseAll() {
        int n = 0;
        List<String> ids = new ArrayList<>();
        synchronized (lock) {
            for (Job j : queue) ids.add(j.id);
        }
        for (String id : ids) if (pause(id)) n++;
        return n;
    }

    public boolean resume(String id) {
        synchronized (lock) {
            Job j = find(id);
            if (j == null || !"paused".equals(j.status)) return false;
            j.status = "queued";
            j.error = null;
            emit(j, true);
            persistQueue();
        }
        pump();
        return true;
    }

    public int resumeAll() {
        int n = 0;
        List<String> ids = new ArrayList<>();
        synchronized (lock) {
            for (Job j : queue) if ("paused".equals(j.status)) ids.add(j.id);
        }
        for (String id : ids) if (resume(id)) n++;
        return n;
    }

    /**
     * Повтор ошибочной/отменённой загрузки. url/headers — свежая ссылка
     * (у Kodik подписанные ссылки со временем истекают); null — старая.
     */
    public boolean retry(String id, String url, JSONObject headers) {
        synchronized (lock) {
            Job j = find(id);
            if (j == null) return false;
            if (!"error".equals(j.status) && !"cancelled".equals(j.status) && !"paused".equals(j.status)) {
                return false;
            }
            if (url != null && url.startsWith("http")) j.url = url;
            if (headers != null) j.headers = headers;
            j.status = "queued";
            j.error = null;
            j.stopReason = null;
            emit(j, true);
            persistQueue();
        }
        pump();
        return true;
    }

    public boolean cancel(String id) {
        synchronized (lock) {
            Job j = find(id);
            if (j == null) return false;
            if ("downloading".equals(j.status) || "starting".equals(j.status)) {
                j.stopReason = "cancel";
                return true;
            }
            if ("queued".equals(j.status) || "paused".equals(j.status) || "error".equals(j.status)) {
                deletePartial(j);
                j.status = "cancelled";
                j.error = "Загрузка отменена пользователем";
                emit(j, true);
                persistQueue();
                return true;
            }
            return false;
        }
    }

    public int cancelAll() {
        int n = 0;
        List<String> ids = new ArrayList<>();
        synchronized (lock) {
            for (Job j : queue) ids.add(j.id);
        }
        for (String id : ids) if (cancel(id)) n++;
        return n;
    }

    public boolean remove(String id) {
        synchronized (lock) {
            Job j = find(id);
            if (j == null) return false;
            if ("downloading".equals(j.status) || "starting".equals(j.status)) {
                j.stopReason = "remove";
                return true;
            }
            if (!"done".equals(j.status)) deletePartial(j);
            queue.remove(j);
            persistQueue();
            return true;
        }
    }

    public void reorder(JSONArray ids) {
        synchronized (lock) {
            Map<String, Job> byId = new LinkedHashMap<>();
            for (Job j : queue) byId.put(j.id, j);
            List<Job> next = new ArrayList<>();
            for (int i = 0; i < ids.length(); i++) {
                Job j = byId.remove(ids.optString(i));
                if (j != null) next.add(j);
            }
            next.addAll(byId.values());
            queue.clear();
            queue.addAll(next);
            persistQueue();
        }
        pump();
    }

    private void pump() {
        synchronized (lock) {
            int max = settings.optBoolean("allAtOnce", false) ? 3 : 1;
            int active = 0;
            for (Job j : queue) {
                if ("downloading".equals(j.status) || "starting".equals(j.status)) active++;
            }
            for (Job j : queue) {
                if (active >= max) break;
                if (!"queued".equals(j.status)) continue;
                j.status = "starting";
                j.stopReason = null;
                j.error = null;
                active++;
                emit(j, true);
                final Job job = j;
                j.future = jobPool.submit(() -> runJob(job));
            }
        }
    }

    // ── Выполнение ───────────────────────────────────────────────────────────

    private void runJob(Job job) {
        try {
            File dir = targetDir(job);
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("Не удалось создать папку загрузок");
            if (dir.getUsableSpace() < MIN_FREE_BYTES) throw new IOException("ENOSPC");
            synchronized (lock) {
                job.status = "downloading";
                emit(job, true);
            }
            if ("hls".equals(job.kind)) {
                downloadHls(job, dir, null);
            } else {
                downloadAuto(job, dir);
            }
            finishDone(job);
        } catch (StopException stop) {
            finishStopped(job);
        } catch (Throwable e) {
            if (job.stopReason != null) {
                finishStopped(job);
            } else {
                finishError(job, describe(e));
                try { Log.w(TAG, "download failed: " + job.filename, e); } catch (Throwable ignored) {}
            }
        } finally {
            pump();
        }
    }

    private void finishDone(Job job) {
        synchronized (lock) {
            job.status = "done";
            job.error = null;
            if (job.total <= 0 || job.received > job.total) job.total = job.received;
            addToLibrary(job);
            emit(job, true);
            queue.remove(job);
            persistQueue();
        }
    }

    private void finishStopped(Job job) {
        synchronized (lock) {
            String reason = job.stopReason;
            job.stopReason = null;
            if ("pause".equals(reason)) {
                job.status = "paused";
                emit(job, true);
            } else {
                deletePartial(job);
                job.status = "cancelled";
                job.error = "Загрузка отменена пользователем";
                emit(job, true);
                if ("remove".equals(reason)) queue.remove(job);
            }
            persistQueue();
        }
    }

    private void finishError(Job job, String message) {
        synchronized (lock) {
            job.status = "error";
            job.error = message;
            emit(job, true);
            persistQueue();
        }
    }

    private File targetDir(Job job) {
        boolean byTitle = settings.optBoolean("organizeByTitle", true);
        if (!byTitle || job.folder.isEmpty()) return root;
        return new File(root, job.folder);
    }

    private static String baseName(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.substring(0, dot) : filename;
    }

    /** Первый запрос: по ответу понимаем, HLS это или прямой файл. */
    private void downloadAuto(Job job, File dir) throws IOException {
        File target = new File(dir, job.filename);
        File part = new File(dir, job.filename + ".part");
        long have = part.exists() ? part.length() : 0;

        HttpURLConnection conn = openWithRetry(job, job.url, have > 0 ? have : -1);
        try {
            int code = conn.getResponseCode();
            if (code == 416 && have > 0) {
                // Уже докачан целиком.
                conn.disconnect();
                promote(part, target);
                job.kind = "mp4";
                job.received = target.length();
                job.total = job.received;
                job.filePath = target.getAbsolutePath();
                return;
            }
            BufferedInputStream in = new BufferedInputStream(conn.getInputStream(), 65536);
            in.mark(16);
            byte[] head = new byte[7];
            int n = readFully(in, head);
            in.reset();
            String ctype = String.valueOf(conn.getContentType()).toLowerCase(Locale.ROOT);
            boolean hls = ctype.contains("mpegurl")
                || (n == 7 && new String(head, StandardCharsets.US_ASCII).equals("#EXTM3U"));
            if (hls) {
                String text = new String(readAll(in), StandardCharsets.UTF_8);
                conn.disconnect();
                synchronized (lock) { job.kind = "hls"; }
                downloadHls(job, dir, text);
                return;
            }
            synchronized (lock) { job.kind = "mp4"; }
            boolean append = code == 206 && have > 0;
            long length = conn.getContentLengthLong();
            job.received = append ? have : 0;
            job.total = length > 0 ? job.received + length : 0;
            String range = conn.getHeaderField("Content-Range");
            if (range != null && range.contains("/")) {
                try {
                    job.total = Long.parseLong(range.substring(range.lastIndexOf('/') + 1).trim());
                } catch (NumberFormatException ignored) {}
            }
            try (OutputStream out = new FileOutputStream(part, append)) {
                byte[] buf = new byte[65536];
                int r;
                while ((r = in.read(buf)) != -1) {
                    checkStop(job);
                    out.write(buf, 0, r);
                    job.received += r;
                    emit(job, false);
                }
            }
            if (job.total > 0 && part.length() < job.total) {
                throw new IOException("ERR_CONNECTION_RESET");
            }
            promote(part, target);
            job.received = target.length();
            job.total = job.received;
            job.filePath = target.getAbsolutePath();
        } finally {
            conn.disconnect();
        }
    }

    private static void promote(File part, File target) throws IOException {
        if (target.exists() && !target.delete()) throw new IOException("Не удалось заменить файл");
        if (!part.renameTo(target)) throw new IOException("Не удалось сохранить файл");
    }

    private static final class Segment {
        final String uri;
        final String file;
        Segment(String uri, String file) {
            this.uri = uri;
            this.file = file;
        }
    }

    private void downloadHls(Job job, File dir, String playlistText) throws IOException {
        String playlistUrl = job.url;
        String text = playlistText != null ? playlistText : fetchText(job, playlistUrl);
        // Master playlist → вариант с наибольшим битрейтом.
        for (int depth = 0; depth < 3 && text.contains("#EXT-X-STREAM-INF"); depth++) {
            String variant = pickVariant(text);
            if (variant == null) throw new IOException("Пустой HLS-плейлист");
            playlistUrl = resolveUri(playlistUrl, variant);
            text = fetchText(job, playlistUrl);
        }
        if (text.contains("#EXT-X-BYTERANGE")) throw new IOException("HLS с byte-range пока не поддерживается");

        File hlsDir = new File(dir, baseName(job.filename) + HLS_DIR_SUFFIX);
        if (!hlsDir.exists() && !hlsDir.mkdirs()) throw new IOException("Не удалось создать папку загрузок");

        List<Segment> downloads = new ArrayList<>();
        StringBuilder local = new StringBuilder();
        int seg = 0;
        int key = 0;
        for (String rawLine : text.split("\r?\n")) {
            String line = rawLine.trim();
            if (line.isEmpty()) continue;
            if (line.startsWith("#")) {
                if ((line.startsWith("#EXT-X-KEY") || line.startsWith("#EXT-X-MAP")) && line.contains("URI=\"")) {
                    int s = line.indexOf("URI=\"") + 5;
                    int e = line.indexOf('"', s);
                    if (e > s) {
                        String uri = line.substring(s, e);
                        boolean isKey = line.startsWith("#EXT-X-KEY");
                        String name = isKey ? "k" + (++key) + ".key" : "init" + (++key) + extOf(uri, ".mp4");
                        downloads.add(new Segment(resolveUri(playlistUrl, uri), name));
                        line = line.substring(0, s) + name + line.substring(e);
                    }
                }
                local.append(line).append('\n');
                continue;
            }
            String name = String.format(Locale.ROOT, "s%05d%s", ++seg, extOf(line, ".ts"));
            downloads.add(new Segment(resolveUri(playlistUrl, line), name));
            local.append(name).append('\n');
        }
        if (seg == 0) throw new IOException("Пустой HLS-плейлист");
        if (!text.contains("#EXT-X-ENDLIST")) local.append("#EXT-X-ENDLIST\n");

        final int totalFiles = downloads.size();
        final AtomicLong bytes = new AtomicLong(0);
        final AtomicInteger doneCount = new AtomicInteger(0);
        for (Segment s : downloads) {
            File f = new File(hlsDir, s.file);
            if (f.exists()) {
                bytes.addAndGet(f.length());
                doneCount.incrementAndGet();
            }
        }
        updateHlsProgress(job, bytes.get(), doneCount.get(), totalFiles);

        final AtomicReference<IOException> failure = new AtomicReference<>();
        final AtomicInteger next = new AtomicInteger(0);
        ExecutorService pool = Executors.newFixedThreadPool(SEGMENT_THREADS);
        List<Future<?>> workers = new ArrayList<>();
        for (int t = 0; t < SEGMENT_THREADS; t++) {
            workers.add(pool.submit(() -> {
                while (failure.get() == null) {
                    int idx = next.getAndIncrement();
                    if (idx >= totalFiles) return;
                    Segment s = downloads.get(idx);
                    File f = new File(hlsDir, s.file);
                    if (f.exists()) continue;
                    try {
                        checkStop(job);
                        long size = fetchToFile(job, s.uri, f);
                        bytes.addAndGet(size);
                        updateHlsProgress(job, bytes.get(), doneCount.incrementAndGet(), totalFiles);
                    } catch (IOException e) {
                        failure.compareAndSet(null, e);
                        return;
                    }
                }
            }));
        }
        try {
            for (Future<?> w : workers) {
                try { w.get(); } catch (Exception ignored) {}
            }
        } finally {
            pool.shutdownNow();
        }
        IOException err = failure.get();
        if (err != null) throw err;
        checkStop(job);

        File index = new File(hlsDir, HLS_INDEX);
        writeText(index, local.toString());
        synchronized (lock) {
            job.received = bytes.get();
            job.total = job.received;
            job.filePath = index.getAbsolutePath();
        }
    }

    private void updateHlsProgress(Job job, long bytes, int done, int total) {
        synchronized (lock) {
            job.received = bytes;
            // Размер заранее неизвестен: оцениваем по средним готовым сегментам.
            job.total = done > 0 ? Math.max(bytes, bytes * total / done) : 0;
        }
        emit(job, false);
    }

    private static String pickVariant(String master) {
        String[] lines = master.split("\r?\n");
        long best = -1;
        String bestUri = null;
        for (int i = 0; i < lines.length; i++) {
            String l = lines[i].trim();
            if (!l.startsWith("#EXT-X-STREAM-INF")) continue;
            long bw = 0;
            int p = l.indexOf("BANDWIDTH=");
            if (p >= 0) {
                int e = p + 10;
                while (e < l.length() && Character.isDigit(l.charAt(e))) e++;
                try { bw = Long.parseLong(l.substring(p + 10, e)); } catch (NumberFormatException ignored) {}
            }
            for (int j = i + 1; j < lines.length; j++) {
                String u = lines[j].trim();
                if (u.isEmpty() || u.startsWith("#")) continue;
                if (bw > best) {
                    best = bw;
                    bestUri = u;
                }
                break;
            }
        }
        return bestUri;
    }

    private static String extOf(String uri, String fallback) {
        String path = uri;
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        int slash = path.lastIndexOf('/');
        if (slash >= 0) path = path.substring(slash + 1);
        int dot = path.lastIndexOf('.');
        if (dot < 0) return fallback;
        String ext = path.substring(dot).toLowerCase(Locale.ROOT);
        if (ext.matches("\\.(ts|m4s|mp4|m4a|aac|key|bin)")) return ext;
        return fallback;
    }

    /** Разрешение относительного URI без java.net.URI: у Kodik в пути бывает «:hls:». */
    static String resolveUri(String base, String ref) {
        if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
        try {
            URL b = new URL(base);
            String origin = b.getProtocol() + "://" + b.getAuthority();
            if (ref.startsWith("//")) return b.getProtocol() + ":" + ref;
            if (ref.startsWith("/")) return origin + ref;
            String path = b.getPath();
            int slash = path.lastIndexOf('/');
            String dir = slash >= 0 ? path.substring(0, slash + 1) : "/";
            String r = ref;
            while (r.startsWith("./")) r = r.substring(2);
            while (r.startsWith("../")) {
                r = r.substring(3);
                int up = dir.lastIndexOf('/', dir.length() - 2);
                dir = up >= 0 ? dir.substring(0, up + 1) : "/";
            }
            return origin + dir + r;
        } catch (Exception e) {
            return ref;
        }
    }

    // ── HTTP ─────────────────────────────────────────────────────────────────

    private HttpURLConnection open(Job job, String url, long rangeFrom) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setRequestProperty("User-Agent", UA);
        conn.setRequestProperty("Accept", "*/*");
        Iterator<String> keys = job.headers.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            String v = job.headers.optString(k, "");
            if (!v.isEmpty()) conn.setRequestProperty(k, v);
        }
        if (conn.getRequestProperty("Referer") == null) {
            conn.setRequestProperty("Referer", refererFor(url));
        }
        if (rangeFrom > 0) conn.setRequestProperty("Range", "bytes=" + rangeFrom + "-");
        return conn;
    }

    private static String refererFor(String url) {
        String u = url.toLowerCase(Locale.ROOT);
        if (u.contains("libria") || u.contains("anilib")) return "https://anilibria.top/";
        if (u.contains("sibnet")) return "https://video.sibnet.ru/";
        return "https://kodikplayer.com/";
    }

    private static boolean retryable(IOException e) {
        if (e instanceof StopException) return false;
        if (e instanceof HttpStatusException) {
            int c = ((HttpStatusException) e).code;
            return c == 408 || c == 429 || c >= 500;
        }
        return true;
    }

    private void backoff(Job job, int attempt) throws IOException {
        long wait = 1000L << attempt;
        long until = System.currentTimeMillis() + wait;
        while (System.currentTimeMillis() < until) {
            checkStop(job);
            try { Thread.sleep(200); } catch (InterruptedException e) { throw new StopException(); }
        }
    }

    private HttpURLConnection openWithRetry(Job job, String url, long rangeFrom) throws IOException {
        IOException last = null;
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            checkStop(job);
            HttpURLConnection conn = null;
            try {
                conn = open(job, url, rangeFrom);
                int code = conn.getResponseCode();
                if (code == 416 && rangeFrom > 0) return conn;
                if (code >= 400) throw new HttpStatusException(code);
                return conn;
            } catch (IOException e) {
                if (conn != null) conn.disconnect();
                last = e;
                if (!retryable(e) || attempt == MAX_ATTEMPTS - 1) throw e;
                backoff(job, attempt);
            }
        }
        throw last != null ? last : new IOException("ERR_FAILED");
    }

    private String fetchText(Job job, String url) throws IOException {
        HttpURLConnection conn = openWithRetry(job, url, -1);
        try (InputStream in = conn.getInputStream()) {
            return new String(readAll(in), StandardCharsets.UTF_8);
        } finally {
            conn.disconnect();
        }
    }

    private long fetchToFile(Job job, String url, File target) throws IOException {
        File tmp = new File(target.getPath() + ".tmp");
        IOException last = null;
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            checkStop(job);
            HttpURLConnection conn = null;
            try {
                conn = open(job, url, -1);
                int code = conn.getResponseCode();
                if (code >= 400) throw new HttpStatusException(code);
                long expected = conn.getContentLengthLong();
                long written = 0;
                try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[65536];
                    int r;
                    while ((r = in.read(buf)) != -1) {
                        checkStop(job);
                        out.write(buf, 0, r);
                        written += r;
                    }
                }
                if (expected > 0 && written < expected) throw new IOException("ERR_CONNECTION_RESET");
                if (!tmp.renameTo(target)) throw new IOException("Не удалось сохранить сегмент");
                return written;
            } catch (IOException e) {
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
                last = e;
                if (!retryable(e) || attempt == MAX_ATTEMPTS - 1) throw e;
                backoff(job, attempt);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
        throw last != null ? last : new IOException("ERR_FAILED");
    }

    private static void checkStop(Job job) throws StopException {
        if (job.stopReason != null || Thread.currentThread().isInterrupted()) throw new StopException();
    }

    /** Коды, которые понимает src/utils/download-errors.ts. */
    private static String describe(Throwable e) {
        if (e instanceof HttpStatusException) return e.getMessage();
        if (e instanceof UnknownHostException) return "Нет подключения к интернету · ERR_NAME_NOT_RESOLVED";
        if (e instanceof SocketTimeoutException) return "ERR_TIMED_OUT";
        if (e instanceof ConnectException) return "ERR_CONNECTION_REFUSED";
        String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
        if (msg.contains("ENOSPC") || msg.toLowerCase(Locale.ROOT).contains("no space")) {
            return "Недостаточно места на устройстве · ENOSPC";
        }
        if (msg.toLowerCase(Locale.ROOT).contains("reset")) return "ERR_CONNECTION_RESET";
        return msg;
    }

    // ── Библиотека ───────────────────────────────────────────────────────────

    private void addToLibrary(Job job) {
        if (job.filePath == null) return;
        JSONArray next = new JSONArray();
        for (int i = 0; i < library.length(); i++) {
            JSONObject e = library.optJSONObject(i);
            if (e == null || job.filePath.equals(e.optString("path"))) continue;
            next.put(e);
        }
        try {
            JSONObject e = new JSONObject();
            e.put("path", job.filePath);
            e.put("name", job.filename);
            e.put("kind", job.kind);
            e.put("folder", job.folder);
            e.put("releaseId", job.releaseId);
            e.put("sourceId", job.sourceId);
            e.put("dubberId", job.dubberId);
            e.put("episodePosition", job.episodePosition);
            e.put("releaseTitle", job.releaseTitle);
            e.put("dubberName", job.dubberName);
            e.put("sourceName", job.sourceName);
            e.put("size", job.received);
            e.put("modifiedAt", System.currentTimeMillis());
            if (job.skip != null) e.put("skip", job.skip);
            next.put(e);
        } catch (Exception ignored) {}
        library = next;
        writeJson(new File(stateDir, "library.json"), library.toString());
    }

    /** Записи библиотеки, чьи файлы ещё на месте. */
    private List<JSONObject> libraryEntries() {
        List<JSONObject> out = new ArrayList<>();
        boolean changed = false;
        JSONArray kept = new JSONArray();
        synchronized (lock) {
            for (int i = 0; i < library.length(); i++) {
                JSONObject e = library.optJSONObject(i);
                if (e == null) continue;
                if (!new File(e.optString("path")).exists()) {
                    changed = true;
                    continue;
                }
                kept.put(e);
                out.add(e);
            }
            if (changed) {
                library = kept;
                writeJson(new File(stateDir, "library.json"), library.toString());
            }
        }
        return out;
    }

    private static String groupName(JSONObject e) {
        String title = e.optString("releaseTitle", "").trim();
        if (!title.isEmpty()) return title;
        String folder = e.optString("folder", "");
        int slash = folder.indexOf('/');
        String first = slash > 0 ? folder.substring(0, slash) : folder;
        return first.isEmpty() ? "Без названия" : first;
    }

    private static JSONObject fileJson(JSONObject e) throws Exception {
        JSONObject f = new JSONObject();
        f.put("name", e.optString("name"));
        f.put("path", e.optString("path"));
        f.put("size", e.optLong("size"));
        f.put("modifiedAt", e.optLong("modifiedAt"));
        int ep = e.optInt("episodePosition", -1);
        f.put("episodePosition", ep >= 0 ? ep : JSONObject.NULL);
        f.put("dubberName", e.optString("dubberName"));
        f.put("sourceName", e.optString("sourceName"));
        f.put("dubberId", e.optLong("dubberId") > 0 ? e.optLong("dubberId") : JSONObject.NULL);
        f.put("sourceId", e.optLong("sourceId") > 0 ? e.optLong("sourceId") : JSONObject.NULL);
        return f;
    }

    public JSONArray listLibrary() {
        Map<String, JSONObject> groups = new LinkedHashMap<>();
        try {
            for (JSONObject e : libraryEntries()) {
                String name = groupName(e);
                JSONObject g = groups.get(name);
                if (g == null) {
                    g = new JSONObject();
                    g.put("id", name);
                    g.put("name", name);
                    g.put("releaseId", e.optLong("releaseId") > 0 ? e.optLong("releaseId") : JSONObject.NULL);
                    g.put("releaseTitle", e.optString("releaseTitle"));
                    g.put("dubberName", e.optString("dubberName"));
                    g.put("sourceName", e.optString("sourceName"));
                    g.put("dubberId", e.optLong("dubberId") > 0 ? e.optLong("dubberId") : JSONObject.NULL);
                    g.put("sourceId", e.optLong("sourceId") > 0 ? e.optLong("sourceId") : JSONObject.NULL);
                    g.put("files", new JSONArray());
                    groups.put(name, g);
                }
                g.getJSONArray("files").put(fileJson(e));
            }
        } catch (Exception ignored) {}
        JSONArray out = new JSONArray();
        for (JSONObject g : groups.values()) out.put(g);
        return out;
    }

    public JSONArray listByRelease(long releaseId) {
        JSONArray out = new JSONArray();
        try {
            for (JSONObject e : libraryEntries()) {
                if (e.optLong("releaseId") != releaseId) continue;
                JSONObject f = fileJson(e);
                f.put("folder", e.optString("folder"));
                out.put(f);
            }
        } catch (Exception ignored) {}
        return out;
    }

    public JSONArray checkFiles(JSONArray items) {
        List<JSONObject> entries = libraryEntries();
        JSONArray out = new JSONArray();
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            String folder = safeFolder(it.optString("folder", ""));
            String filename = safeName(it.optString("filename", ""));
            String path = null;
            for (JSONObject e : entries) {
                if (folder.equals(e.optString("folder")) && filename.equals(e.optString("name"))) {
                    path = e.optString("path");
                    break;
                }
            }
            try {
                JSONObject r = new JSONObject();
                r.put("folder", it.optString("folder", ""));
                r.put("filename", it.optString("filename", ""));
                r.put("exists", path != null);
                r.put("path", path != null ? path : JSONObject.NULL);
                out.put(r);
            } catch (Exception ignored) {}
        }
        return out;
    }

    public JSONObject readSkip(String path) {
        for (JSONObject e : libraryEntries()) {
            if (path.equals(e.optString("path"))) return e.optJSONObject("skip");
        }
        return null;
    }

    public boolean saveSkip(String path, JSONObject skip) {
        synchronized (lock) {
            for (int i = 0; i < library.length(); i++) {
                JSONObject e = library.optJSONObject(i);
                if (e == null || !path.equals(e.optString("path"))) continue;
                try { e.put("skip", skip != null ? skip : JSONObject.NULL); } catch (Exception ignored) {}
                writeJson(new File(stateDir, "library.json"), library.toString());
                return true;
            }
        }
        return false;
    }

    public boolean deleteFile(String path) {
        File f = new File(path);
        if (!isInsideRoot(f)) return false;
        File victim = HLS_INDEX.equals(f.getName()) && f.getParentFile() != null
            && f.getParentFile().getName().endsWith(HLS_DIR_SUFFIX)
            ? f.getParentFile()
            : f;
        deleteRecursive(victim);
        synchronized (lock) {
            JSONArray next = new JSONArray();
            for (int i = 0; i < library.length(); i++) {
                JSONObject e = library.optJSONObject(i);
                if (e != null && !path.equals(e.optString("path"))) next.put(e);
            }
            library = next;
            writeJson(new File(stateDir, "library.json"), library.toString());
        }
        pruneEmptyDirs(victim.getParentFile());
        return true;
    }

    public boolean deleteGroup(String name) {
        List<String> paths = new ArrayList<>();
        for (JSONObject e : libraryEntries()) {
            if (name.equals(groupName(e))) paths.add(e.optString("path"));
        }
        for (String p : paths) deleteFile(p);
        return !paths.isEmpty();
    }

    boolean isInsideRoot(File f) {
        try {
            String r = root.getCanonicalPath() + File.separator;
            return f.getCanonicalPath().startsWith(r);
        } catch (IOException e) {
            return false;
        }
    }

    private void pruneEmptyDirs(File dir) {
        try {
            String r = root.getCanonicalPath();
            while (dir != null && !dir.getCanonicalPath().equals(r) && isInsideRoot(dir)) {
                String[] rest = dir.list();
                if (rest == null || rest.length > 0 || !dir.delete()) return;
                dir = dir.getParentFile();
            }
        } catch (IOException ignored) {}
    }

    private void deletePartial(Job job) {
        File dir = targetDir(job);
        //noinspection ResultOfMethodCallIgnored
        new File(dir, job.filename + ".part").delete();
        File hlsDir = new File(dir, baseName(job.filename) + HLS_DIR_SUFFIX);
        if (hlsDir.exists() && !new File(hlsDir, HLS_INDEX).exists()) deleteRecursive(hlsDir);
        job.received = 0;
        job.total = 0;
    }

    private static void deleteRecursive(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRecursive(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    // ── Состояние и события ──────────────────────────────────────────────────

    private void restoreQueue() {
        JSONArray saved = readJsonArray(new File(stateDir, "queue.json"));
        for (int i = 0; i < saved.length(); i++) {
            JSONObject o = saved.optJSONObject(i);
            if (o == null || o.optString("id").isEmpty() || !o.optString("url").startsWith("http")) continue;
            Job j = new Job();
            j.id = o.optString("id");
            j.url = o.optString("url");
            JSONObject headers = o.optJSONObject("headers");
            if (headers != null) j.headers = headers;
            j.filename = safeName(o.optString("filename", "episode.mp4"));
            j.folder = safeFolder(o.optString("folder", ""));
            j.releaseId = o.optLong("releaseId");
            j.sourceId = o.optLong("sourceId");
            j.dubberId = o.optLong("dubberId");
            j.episodePosition = o.optInt("episodePosition", -1);
            j.releaseTitle = o.optString("releaseTitle");
            j.dubberName = o.optString("dubberName");
            j.sourceName = o.optString("sourceName");
            j.skip = o.optJSONObject("skip");
            j.kind = o.optString("kind", "");
            j.received = o.optLong("received");
            j.total = o.optLong("total");
            j.error = o.optString("error", null);
            String st = o.optString("status", "queued");
            // Прерванные перезапуском продолжаем сами; пауза и ошибка ждут пользователя.
            j.status = "paused".equals(st) || "error".equals(st) ? st : "queued";
            queue.add(j);
        }
        if (!queue.isEmpty()) jobPool.submit(this::pump);
    }

    private void persistQueue() {
        JSONArray arr = new JSONArray();
        for (Job j : queue) {
            if ("done".equals(j.status) || "cancelled".equals(j.status)) continue;
            JSONObject o = toJson(j);
            try {
                o.put("url", j.url);
                o.put("headers", j.headers);
                o.put("kind", j.kind);
                if (j.skip != null) o.put("skip", j.skip);
            } catch (Exception ignored) {}
            arr.put(o);
        }
        writeJson(new File(stateDir, "queue.json"), arr.toString());
    }

    private JSONObject toJson(Job j) {
        JSONObject o = new JSONObject();
        try {
            o.put("id", j.id);
            o.put("filename", j.filename);
            o.put("received", j.received);
            o.put("total", j.total);
            o.put("status", j.status);
            if (j.error != null) o.put("error", j.error);
            if (j.filePath != null) o.put("filePath", j.filePath);
            if (j.releaseId > 0) o.put("releaseId", j.releaseId);
            if (j.sourceId > 0) o.put("sourceId", j.sourceId);
            if (j.dubberId > 0) o.put("dubberId", j.dubberId);
            if (j.episodePosition >= 0) o.put("episodePosition", j.episodePosition);
            o.put("releaseTitle", j.releaseTitle);
            o.put("folder", j.folder);
            o.put("dubberName", j.dubberName);
            o.put("sourceName", j.sourceName);
            o.put("playable", "done".equals(j.status));
        } catch (Exception ignored) {}
        return o;
    }

    private void emit(Job job, boolean force) {
        long now = System.currentTimeMillis();
        if (!force && now - job.lastEmit < EMIT_INTERVAL_MS) return;
        job.lastEmit = now;
        Emitter e = emitter;
        if (e == null) return;
        JSONObject payload;
        synchronized (lock) {
            payload = toJson(job);
        }
        try { e.emit(payload); } catch (Exception ignored) {}
    }

    // ── Утилиты ──────────────────────────────────────────────────────────────

    static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[<>:\"/\\\\|?*\\x00-\\x1F]", " ").trim();
        if (n.isEmpty() || n.equals(".") || n.equals("..")) n = "episode.mp4";
        return n.length() > 150 ? n.substring(0, 150) : n;
    }

    static String safeFolder(String folder) {
        if (folder == null) return "";
        StringBuilder out = new StringBuilder();
        for (String part : folder.replace('\\', '/').split("/")) {
            String p = part.replaceAll("[<>:\"|?*\\x00-\\x1F]", " ").trim();
            if (p.isEmpty() || p.equals(".") || p.equals("..")) continue;
            if (out.length() > 0) out.append('/');
            out.append(p.length() > 120 ? p.substring(0, 120) : p);
        }
        return out.toString();
    }

    private static int readFully(InputStream in, byte[] buf) throws IOException {
        int off = 0;
        while (off < buf.length) {
            int r = in.read(buf, off, buf.length - off);
            if (r < 0) break;
            off += r;
        }
        return off;
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
        return out.toByteArray();
    }

    private static JSONObject readJsonObject(File f) {
        try {
            return new JSONObject(readText(f));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private static JSONArray readJsonArray(File f) {
        try {
            return new JSONArray(readText(f));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static String readText(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            return new String(readAll(in), StandardCharsets.UTF_8);
        }
    }

    private static void writeText(File f, String text) throws IOException {
        File tmp = new File(f.getPath() + ".tmp");
        try (OutputStream out = new FileOutputStream(tmp)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
        }
        if (f.exists() && !f.delete()) throw new IOException("write " + f.getName());
        if (!tmp.renameTo(f)) throw new IOException("write " + f.getName());
    }

    private static void writeJson(File f, String json) {
        try {
            writeText(f, json);
        } catch (IOException e) {
            try { Log.w(TAG, "state write failed: " + f.getName(), e); } catch (Throwable ignored) {}
        }
    }
}
