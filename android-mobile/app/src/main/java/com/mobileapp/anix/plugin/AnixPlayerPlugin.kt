package com.mobileapp.anix.plugin

import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.StatFs
import androidx.activity.result.ActivityResult
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.offline.DownloadService
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.mobileapp.anix.download.AnixDownloadService
import com.mobileapp.anix.media.HeaderStore
import com.mobileapp.anix.media.MediaEngine
import com.mobileapp.anix.net.AnixBackClient
import com.mobileapp.anix.playback.PlaybackCoordinator
import com.mobileapp.anix.ui.PlayerActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Граница «веб ↔ нативный плеер/загрузки».
 * Веб: play(), download(), downloads(), removeDownload(), storage(); события: downloadState, network.
 */
@UnstableApi
@CapacitorPlugin(name = "AnixPlayer")
class AnixPlayerPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var netCallback: ConnectivityManager.NetworkCallback? = null

    private val dlListener = object : DownloadManager.Listener {
        override fun onDownloadChanged(downloadManager: DownloadManager, download: Download, finalException: Exception?) {
            notifyListeners("downloadState", download.toJs(finalException?.message))
        }

        override fun onDownloadRemoved(downloadManager: DownloadManager, download: Download) {
            notifyListeners("downloadState", download.toJs(null).put("state", "removed"))
        }
    }

    override fun load() {
        MediaEngine.init(context)
        MediaEngine.downloadManager.addListener(dlListener)
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = emitNetwork(cm)
            override fun onLost(network: Network) = emitNetwork(cm)
            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) = emitNetwork(cm)
        }
        cm.registerDefaultNetworkCallback(cb)
        netCallback = cb
        resumePendingDownloads()
    }

    /** Приложение запущено заново (процесс мог умереть) — докачиваем незавершённое, пока не вернули сеть/сервис. */
    private fun resumePendingDownloads() {
        val pending = runCatching {
            MediaEngine.downloadManager.downloadIndex.getDownloads(
                Download.STATE_QUEUED, Download.STATE_DOWNLOADING, Download.STATE_RESTARTING, Download.STATE_STOPPED,
            ).use { it.count > 0 }
        }.getOrDefault(false)
        if (pending) {
            runCatching { DownloadService.sendResumeDownloads(context, AnixDownloadService::class.java, false) }
        }
    }

    // --- Системные полосы под тему ------------------------------------------------------------

    /** Последние цвета от веба: Capacitor SystemBars сбрасывает фон окна на чёрный при повороте. */
    private var barsTop: Int? = null
    private var barsBottom: Int? = null
    private var barsLight = false

    /** Фон под строкой состояния (верх) и под жестовой панелью (низ) + тёмные/светлые значки. */
    private class SystemBarsDrawable(private val top: Int, private val bottom: Int, private val bottomInset: () -> Int) :
        android.graphics.drawable.Drawable() {
        private val paint = android.graphics.Paint()
        override fun draw(canvas: android.graphics.Canvas) {
            val b = bounds
            val split = (b.bottom - bottomInset()).coerceIn(b.top, b.bottom)
            paint.color = top
            canvas.drawRect(b.left.toFloat(), b.top.toFloat(), b.right.toFloat(), split.toFloat(), paint)
            paint.color = bottom
            canvas.drawRect(b.left.toFloat(), split.toFloat(), b.right.toFloat(), b.bottom.toFloat(), paint)
        }
        override fun setAlpha(alpha: Int) {}
        override fun setColorFilter(colorFilter: android.graphics.ColorFilter?) {}
        @Deprecated("Deprecated in Java")
        override fun getOpacity() = android.graphics.PixelFormat.OPAQUE
    }

    private fun applySystemBars() {
        val top = barsTop ?: return
        val bottom = barsBottom ?: top
        val window = activity.window
        val decor = window.decorView
        decor.background = SystemBarsDrawable(top, bottom) {
            androidx.core.view.ViewCompat.getRootWindowInsets(decor)
                ?.getInsets(WindowInsetsCompat.Type.navigationBars())?.bottom ?: 0
        }
        WindowCompat.getInsetsController(window, decor).apply {
            isAppearanceLightStatusBars = barsLight
            isAppearanceLightNavigationBars = barsLight
        }
    }

    /** {top: "#rrggbb", bottom?: "#rrggbb", light: boolean} — цвета системных полос по теме приложения. */
    @PluginMethod
    fun setSystemBars(call: PluginCall) {
        val top = runCatching { android.graphics.Color.parseColor(call.getString("top")) }.getOrNull()
        if (top == null) { call.reject("top обязателен"); return }
        barsTop = top
        barsBottom = runCatching { android.graphics.Color.parseColor(call.getString("bottom")) }.getOrNull()
        barsLight = call.getBoolean("light") ?: false
        activity.runOnUiThread { applySystemBars(); call.resolve() }
    }

    override fun handleOnConfigurationChanged(newConfig: android.content.res.Configuration?) {
        super.handleOnConfigurationChanged(newConfig)
        // После SystemBars (он ставит чёрный windowBackground) — возвращаем свои цвета
        activity.window.decorView.post { applySystemBars() }
    }

    override fun handleOnResume() {
        super.handleOnResume()
        activity.window.decorView.post { applySystemBars() }
    }

    // --- Язык АниксПлеера ---------------------------------------------------------------------

    /**
     * Системный экран «Язык приложения» для официального АниксПлеера (Android 13+; он поддерживает en/ru).
     * Ниже Android 13 — карточка приложения: язык там совпадает с системным. {opened: "locale"|"details"|"none"}
     */
    @PluginMethod
    fun openAnixPlayerLanguage(call: PluginCall) {
        if (installedVersion(officialAnixPlayer) == null) { call.resolve(JSObject().put("opened", "none")); return }
        val uri = Uri.fromParts("package", officialAnixPlayer, null)
        val tries = buildList {
            if (android.os.Build.VERSION.SDK_INT >= 33) add("locale" to Intent(android.provider.Settings.ACTION_APP_LOCALE_SETTINGS, uri))
            add("details" to Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri))
        }
        for ((kind, intent) in tries) {
            try {
                activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                call.resolve(JSObject().put("opened", kind)); return
            } catch (_: Exception) { /* следующий вариант */ }
        }
        call.resolve(JSObject().put("opened", "none"))
    }

    override fun handleOnDestroy() {
        MediaEngine.downloadManager.removeListener(dlListener)
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        netCallback?.let { runCatching { cm.unregisterNetworkCallback(it) } }
    }

    private fun online(cm: ConnectivityManager): Boolean {
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun netJs(cm: ConnectivityManager): JSObject {
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        return JSObject()
            .put("online", online(cm))
            .put("unmetered", caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == true)
    }

    private fun emitNetwork(cm: ConnectivityManager) = notifyListeners("network", netJs(cm))

    /**
     * Ориентация и системные панели для экрана просмотра: {mode: "landscape"} — альбомная + immersive,
     * {mode: "portrait"} — обычный портрет с панелями.
     */
    @PluginMethod
    fun setOrientation(call: PluginCall) {
        val landscape = call.getString("mode") == "landscape"
        val act = activity
        if (act == null) { call.resolve(); return }
        act.runOnUiThread {
            // Вне плеера — обычный поворот (телефон/планшет, с учётом системной блокировки поворота).
            act.requestedOrientation = if (landscape) {
                ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            } else {
                ActivityInfo.SCREEN_ORIENTATION_FULL_USER
            }
            val controller = WindowCompat.getInsetsController(act.window, act.window.decorView)
            if (landscape) {
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                controller.hide(WindowInsetsCompat.Type.systemBars())
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars())
            }
            call.resolve()
        }
    }

    @PluginMethod
    fun networkState(call: PluginCall) {
        call.resolve(netJs(context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager))
    }

    // --- Плеер -------------------------------------------------------------------------------

    @PluginMethod
    fun play(call: PluginCall) {
        val launch = call.data.toString()
        try {
            PlayerActivity.parseLaunch(launch)
        } catch (e: Exception) {
            call.reject("Неверные параметры запуска: " + e.message)
            return
        }
        val intent = Intent(context, PlayerActivity::class.java).putExtra(PlayerActivity.EXTRA_LAUNCH, launch)
        startActivityForResult(call, intent, "playerResult")
    }

    @ActivityCallback
    private fun playerResult(call: PluginCall?, result: ActivityResult) {
        val json = result.data?.getStringExtra(PlayerActivity.EXTRA_RESULT)
        call?.resolve(if (json != null) JSObject(json) else JSObject().put("closed", true))
    }

    // --- Внешние плееры ----------------------------------------------------------------------

    /** Официальный АниксПлеер (Anixart, на базе mpv) — протокол как у Anixart 10.0. */
    private val officialAnixPlayer = "com.swiftsoft.anixart.player"
    /** Наш форк mpvEx (AnixApp Player) — Intent API из docs/INTENT_API.md; запасной вариант. */
    private val ownAnixPlayerPackages = listOf("com.anixapp.player", "com.anixapp.player.debug")

    private fun installedVersion(pkg: String): Long? = try {
        val info = context.packageManager.getPackageInfo(pkg, 0)
        if (android.os.Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    } catch (_: PackageManager.NameNotFoundException) { null }

    private fun isNetworkUrl(url: String?): Boolean {
        val scheme = url?.let { Uri.parse(it).scheme?.lowercase() }
        return scheme == "https" || scheme == "http"
    }

    /** {installed, versionCode?, abis} — установлен ли официальный АниксПлеер (для кнопки «Установить/Обновить»). */
    @PluginMethod
    fun anixPlayerStatus(call: PluginCall) {
        val out = JSObject()
        val v = installedVersion(officialAnixPlayer)
        out.put("installed", v != null)
        if (v != null) out.put("versionCode", v)
        out.put("ownInstalled", ownAnixPlayerPackages.any { installedVersion(it) != null })
        out.put("abis", JSArray(android.os.Build.SUPPORTED_ABIS.toList()))
        call.resolve(out)
    }

    /**
     * Официальный АниксПлеер: ACTION_VIEW c плейлистом (video_list) — те же extras, что передаёт Anixart 10.0.
     * Стартовая серия = элемент video_list, совпадающий с data. Позиции — в миллисекундах.
     */
    private fun buildOfficialAnixIntent(call: PluginCall, url: String, title: String?, headers: Array<String>?, startMs: Long): Intent? {
        val items = call.getArray("playlist")?.toList<org.json.JSONObject>().orEmpty()
            .filter { isNetworkUrl(it.optString("url")) }
        val urls = if (items.isEmpty()) listOf(url) else items.map { it.getString("url") }
        var start = call.getInt("startIndex") ?: urls.indexOf(url)
        if (start !in urls.indices) start = 0
        val uris = urls.map { Uri.parse(it) }.toTypedArray()
        val names = Array(urls.size) { i -> items.getOrNull(i)?.optString("name").orEmpty().ifBlank { title.orEmpty() } }
        val infos = Array(urls.size) { i -> items.getOrNull(i)?.optString("info").orEmpty() }
        val thumb = call.getString("thumbnail")?.takeIf { isNetworkUrl(it) }.orEmpty()
        val qualities = org.json.JSONArray()
        for (i in urls.indices) qualities.put(items.getOrNull(i)?.optJSONObject("qualities") ?: org.json.JSONObject())
        val positions = IntArray(urls.size) { i ->
            val ms = items.getOrNull(i)?.optLong("positionMs", 0L) ?: 0L
            (if (i == start && startMs > 0) startMs else ms).coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()
        }
        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uris[start], "video/*")
            setPackage(officialAnixPlayer)
            putExtra("video_list", uris)
            putExtra("video_list.name", names)
            putExtra("video_list.info", infos)
            putExtra("video_list.thumbnail", Array(urls.size) { thumb })
            headers?.let { putExtra("headers", it) }
            title?.let { putExtra("title", it) }
            putExtra("playlist_qualities", qualities.toString())
            call.getString("selectedQuality")?.let { putExtra("selected_quality", it) }
            putExtra("playlist_positions", positions)
            // Честно представляемся своим пакетом: плеер это поле не проверяет
            putExtra("host_package_name", context.packageName)
            try {
                val pi = context.packageManager.getPackageInfo(context.packageName, 0)
                putExtra("host_version_code", (if (android.os.Build.VERSION.SDK_INT >= 28) pi.longVersionCode else @Suppress("DEPRECATION") pi.versionCode.toLong()).toInt())
                putExtra("host_version_name", pi.versionName)
            } catch (_: Exception) { /* не критично */ }
        }
    }

    /**
     * Открыть серию во внешнем плеере.
     * {mode: "anix"|"chooser", url, title?, label?, mime?, headers?: [name,value,…], startMs?,
     *  playlist?: [{url, name?, info?, qualities?: {"720p": url}, positionMs?}], startIndex?, selectedQuality?, thumbnail?}
     * "anix" — официальный АниксПлеер (протокол Anixart), иначе наш AnixApp Player; если нет ни одного → {installed:false}.
     * "chooser" — системный выбор любого видеоплеера (ACTION_VIEW).
     */
    @PluginMethod
    fun openExternalPlayer(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) { call.reject("url обязателен"); return }
        // Только сетевые потоки: file:// и content:// (в т.ч. наш FileProvider) другим приложениям не отдаём
        if (!isNetworkUrl(url)) { call.reject("Недопустимая ссылка"); return }
        val mode = call.getString("mode") ?: "chooser"
        val title = call.getString("title")
        val headers = call.getArray("headers")?.toList<String>()?.toTypedArray()
        val startMs = call.getLong("startMs") ?: 0L
        val view = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(Uri.parse(url), call.getString("mime") ?: "video/*")
        }
        val intent: Intent
        if (mode == "anix" && installedVersion(officialAnixPlayer) != null) {
            intent = try {
                buildOfficialAnixIntent(call, url, title, headers, startMs)!!
            } catch (e: Exception) {
                call.reject("Не удалось подготовить плейлист: " + e.message); return
            }
        } else if (mode == "anix") {
            val pkg = ownAnixPlayerPackages.firstOrNull { installedVersion(it) != null }
            if (pkg == null) { call.resolve(JSObject().put("installed", false)); return }
            intent = view.setClassName(pkg, "com.anixapp.player.ui.player.PlayerActivity").apply {
                title?.let { putExtra("com.anixapp.player.extra.TITLE", it) }
                call.getString("label")?.let { putExtra("com.anixapp.player.extra.EPISODE_LABEL", it) }
                headers?.let { putExtra("com.anixapp.player.extra.HEADERS", it) }
                if (startMs > 0) putExtra("com.anixapp.player.extra.START_POSITION_MS", startMs)
            }
        } else {
            val v = view.apply {
                title?.let { putExtra("title", it) }
                headers?.let { putExtra("headers", it) }
                if (startMs > 0) putExtra("position", startMs.toInt())
                putExtra("return_result", true)
            }
            intent = Intent.createChooser(v, title ?: "Открыть в плеере")
        }
        try {
            startActivityForResult(call, intent, "externalPlayerResult")
        } catch (e: Exception) {
            call.reject("Не удалось открыть плеер: " + e.message)
        }
    }

    @ActivityCallback
    private fun externalPlayerResult(call: PluginCall?, result: ActivityResult) {
        val d = result.data
        val out = JSObject().put("installed", true).put("closed", true)
        val pos = d?.getLongExtra("com.anixapp.player.extra.RESULT_POSITION_MS", -1L) ?: -1L
        if (pos >= 0) {
            out.put("positionMs", pos)
            out.put("durationMs", d?.getLongExtra("com.anixapp.player.extra.RESULT_DURATION_MS", 0L) ?: 0L)
            out.put("completed", d?.getBooleanExtra("com.anixapp.player.extra.RESULT_COMPLETED", false) ?: false)
        } else if (d?.hasExtra("position") == true) {
            out.put("positionMs", d.getIntExtra("position", 0).toLong())
            out.put("durationMs", d.getIntExtra("duration", 0).toLong())
        }
        // Официальный АниксПлеер: на какой серии плейлиста остановились и позиции (мс) по сериям
        if (d?.hasExtra("playlist_position") == true) {
            out.put("playlistPosition", d.getIntExtra("playlist_position", -1))
            val idx = d.getIntArrayExtra("playlist_resume_indices")
            val vals = d.getIntArrayExtra("playlist_resume_values")
            if (idx != null && vals != null && idx.size == vals.size) {
                out.put("resumeIndices", JSArray(idx.toList()))
                out.put("resumeValuesMs", JSArray(vals.toList()))
            }
        }
        call?.resolve(out)
    }

    // --- Офлайн -------------------------------------------------------------------------------

    /** {key, url} — сохранить постер в файл приложения, чтобы он был виден без сети. Возвращает {path}. */
    @PluginMethod
    fun savePoster(call: PluginCall) {
        val key = call.getString("key")?.replace(Regex("[^A-Za-z0-9_-]"), "_")
        val url = call.getString("url")
        if (key.isNullOrBlank() || url.isNullOrBlank()) { call.reject("key и url обязательны"); return }
        // Только https-картинки разумного размера: file://, jar:, http и ответы не-изображения отклоняются
        if (!url.startsWith("https://", ignoreCase = true)) { call.reject("savePoster: только https"); return }
        scope.launch(Dispatchers.IO) {
            try {
                val dir = java.io.File(context.filesDir, "posters").apply { mkdirs() }
                val file = java.io.File(dir, "$key.img")
                if (!file.exists() || file.length() == 0L) {
                    val conn = (java.net.URL(url).openConnection() as javax.net.ssl.HttpsURLConnection).apply {
                        connectTimeout = 15_000; readTimeout = 20_000; instanceFollowRedirects = true
                    }
                    try {
                        if (conn.responseCode !in 200..299) throw java.io.IOException("HTTP ${conn.responseCode}")
                        if (conn.contentType?.startsWith("image/") != true) throw java.io.IOException("не изображение")
                        val limit = 10L * 1024 * 1024
                        if (conn.contentLengthLong > limit) throw java.io.IOException("слишком большой файл")
                        val tmp = java.io.File(dir, "$key.part")
                        conn.inputStream.use { input ->
                            tmp.outputStream().use { out ->
                                val buf = ByteArray(16 * 1024)
                                var total = 0L
                                while (true) {
                                    val n = input.read(buf)
                                    if (n < 0) break
                                    total += n
                                    if (total > limit) throw java.io.IOException("слишком большой файл")
                                    out.write(buf, 0, n)
                                }
                            }
                        }
                        if (!tmp.renameTo(file)) { tmp.copyTo(file, overwrite = true); tmp.delete() }
                    } finally {
                        conn.disconnect()
                    }
                }
                call.resolve(JSObject().put("path", file.absolutePath))
            } catch (e: Exception) {
                call.reject("savePoster: " + e.message)
            }
        }
    }

    /**
     * {title, items:[{downloadId, name}], index, startPositionMs?} — нативный плеер по скачанным сериям, без сети.
     * Серии без завершённой загрузки в плейлист не попадают.
     */
    @PluginMethod
    fun playOffline(call: PluginCall) {
        val items = call.getArray("items")
        if (items == null || items.length() == 0) { call.reject("items обязателен"); return }
        val episodes = org.json.JSONArray()
        val urls = org.json.JSONArray()
        var startIndex = call.getInt("index") ?: 0
        val wantedId = call.getString("startDownloadId")
        for (i in 0 until items.length()) {
            val o = items.getJSONObject(i)
            val did = o.optString("downloadId")
            val d = MediaEngine.downloadManager.downloadIndex.getDownload(did)
            if (d == null || d.state != Download.STATE_COMPLETED) continue
            if (wantedId != null && did == wantedId) startIndex = episodes.length()
            episodes.put(org.json.JSONObject().put("id", o.optString("id", did)).put("name", o.optString("name")).put("embedUrl", ""))
            urls.put(d.request.uri.toString())
        }
        if (episodes.length() == 0) { call.reject("Нет скачанных серий"); return }
        val launch = org.json.JSONObject()
            .put("title", call.getString("title") ?: "")
            .put("episodes", episodes)
            .put("offlineUrls", urls)
            .put("index", startIndex.coerceIn(0, episodes.length() - 1))
            .put("startPositionMs", call.getLong("startPositionMs") ?: 0L)
            .toString()
        val intent = Intent(context, PlayerActivity::class.java).putExtra(PlayerActivity.EXTRA_LAUNCH, launch)
        startActivityForResult(call, intent, "playerResult")
    }

    // --- Загрузки ----------------------------------------------------------------------------

    /**
     * {id, embedUrl, quality?, title?, hostOverride?} — резолв через AnixBack и постановка в очередь.
     * hostOverride нужен для теста CacheKeyFactory (подмена зеркала p12 на p14).
     */
    @PluginMethod
    fun download(call: PluginCall) {
        val id = call.getString("id")
        val embed = call.getString("embedUrl")
        if (id == null || embed == null) {
            call.reject("id и embedUrl обязательны")
            return
        }
        val preferred = call.getString("quality")
        val hostOverride = call.getString("hostOverride")
        scope.launch {
            try {
                val r = AnixBackClient.resolve(embed)
                val q = AnixBackClient.pickNearest(r.qualityMap, preferred)
                var url = r.qualityMap[q] ?: r.directUrl
                if (url == null) {
                    call.reject("Источник не отдаёт прямую ссылку (embed-only)")
                    return@launch
                }
                if (hostOverride != null) url = url.replace(Regex("^https://[^/]+"), "https://" + hostOverride)
                HeaderStore.headers = r.headers
                val downloadId = PlaybackCoordinator.downloadId(id, q)
                // Уже скачано или в очереди — не ставим повторно (кнопка «Скачать всё» идемпотентна).
                val existing = MediaEngine.downloadManager.downloadIndex.getDownload(downloadId)
                if (existing != null && existing.state != Download.STATE_FAILED && existing.state != Download.STATE_REMOVING) {
                    call.resolve(JSObject().put("downloadId", downloadId).put("quality", q).put("skipped", true))
                    return@launch
                }
                // Метаданные тайтла лежат в самой загрузке (БД Media3) — список «Загрузки» работает без сети.
                val meta = call.getObject("meta")?.apply { put("quality", q) }?.toString()
                val req = DownloadRequest.Builder(downloadId, android.net.Uri.parse(url))
                    .setMimeType(if (url.contains(".m3u8")) MimeTypes.APPLICATION_M3U8 else null)
                    .setData((meta ?: call.getString("title") ?: id).toByteArray())
                    .build()
                DownloadService.sendAddDownload(context, AnixDownloadService::class.java, req, false)
                call.resolve(JSObject().put("downloadId", downloadId).put("url", url).put("quality", q))
            } catch (e: Exception) {
                call.reject("download: " + e.message)
            }
        }
    }

    @PluginMethod
    fun pauseDownloads(call: PluginCall) {
        DownloadService.sendPauseDownloads(context, AnixDownloadService::class.java, false)
        call.resolve()
    }

    @PluginMethod
    fun resumeDownloads(call: PluginCall) {
        DownloadService.sendResumeDownloads(context, AnixDownloadService::class.java, false)
        call.resolve()
    }

    @PluginMethod
    fun removeDownload(call: PluginCall) {
        val id = call.getString("downloadId")
        if (id == null) {
            call.reject("downloadId обязателен")
            return
        }
        DownloadService.sendRemoveDownload(context, AnixDownloadService::class.java, id, false)
        call.resolve()
    }

    @PluginMethod
    fun downloads(call: PluginCall) {
        val arr = JSArray()
        MediaEngine.downloadManager.downloadIndex.getDownloads().use { c ->
            while (c.moveToNext()) arr.put(c.download.toJs(null))
        }
        call.resolve(JSObject().put("downloads", arr))
    }

    @PluginMethod
    fun removeAllDownloads(call: PluginCall) {
        DownloadService.sendRemoveAllDownloads(context, AnixDownloadService::class.java, false)
        call.resolve()
    }

    @PluginMethod
    fun downloadSettings(call: PluginCall) {
        call.resolve(JSObject().put("wifiOnly", MediaEngine.isWifiOnly()))
    }

    @PluginMethod
    fun setDownloadSettings(call: PluginCall) {
        call.getBoolean("wifiOnly")?.let { MediaEngine.setWifiOnly(it) }
        call.resolve(JSObject().put("wifiOnly", MediaEngine.isWifiOnly()))
    }

    @PluginMethod
    fun storage(call: PluginCall) {
        val stat = StatFs(context.filesDir.path)
        call.resolve(
            JSObject()
                .put("freeBytes", stat.availableBytes)
                .put("totalBytes", stat.totalBytes)
                .put("cacheBytes", MediaEngine.cache.cacheSpace),
        )
    }

    private fun metaObject(data: ByteArray): JSObject? =
        try { JSObject(data.toString(Charsets.UTF_8)) } catch (_: Exception) { null }

    private fun metaText(data: ByteArray): String {
        val text = data.toString(Charsets.UTF_8)
        return metaObject(data)?.optString("title") ?: text
    }

    private fun Download.toJs(error: String?): JSObject = JSObject()
        .put("id", request.id)
        .put("url", request.uri.toString())
        .put("title", metaText(request.data))
        .put("meta", metaObject(request.data))
        .put("totalBytes", contentLength)
        .put(
            "state",
            when (state) {
                Download.STATE_QUEUED -> "queued"
                Download.STATE_DOWNLOADING -> "downloading"
                Download.STATE_COMPLETED -> "completed"
                Download.STATE_FAILED -> "failed"
                Download.STATE_STOPPED -> "stopped"
                Download.STATE_REMOVING -> "removing"
                Download.STATE_RESTARTING -> "restarting"
                else -> "unknown"
            },
        )
        .put("percent", percentDownloaded.toDouble())
        .put("bytes", bytesDownloaded)
        .put("failureReason", failureReason)
        .put("error", error)
}
