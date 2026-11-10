package com.mobileapp.anix.plugin

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Обновление APK из релизов GitHub.
 * Веб: download({url, fileName}) → {path}; события "progress" {received, total, percent};
 * install({path}) → {started} | {needsPermission: true} (открыт экран «Установка неизвестных приложений»);
 * cancel(); info() → {versionName, versionCode, canInstall}.
 */
@CapacitorPlugin(name = "AnixUpdater")
class AnixUpdaterPlugin : Plugin() {
    private val cancelled = AtomicBoolean(false)
    @Volatile private var running = false

    @PluginMethod
    fun info(call: PluginCall) {
        val out = JSObject()
        try {
            val pi = context.packageManager.getPackageInfo(context.packageName, 0)
            out.put("versionName", pi.versionName ?: "")
            out.put("versionCode", if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else @Suppress("DEPRECATION") pi.versionCode.toLong())
        } catch (_: Exception) {
            out.put("versionName", "")
        }
        out.put("canInstall", canInstall())
        call.resolve(out)
    }

    @PluginMethod
    fun download(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank() || !url.startsWith("https://")) {
            call.reject("Bad url")
            return
        }
        if (running) {
            call.reject("Already downloading")
            return
        }
        val rawName = call.getString("fileName") ?: "AnixApp-update.apk"
        val fileName = rawName.replace(Regex("[^A-Za-z0-9._-]"), "_").let { if (it.endsWith(".apk")) it else "$it.apk" }
        running = true
        cancelled.set(false)
        Thread {
            val dir = File(context.cacheDir, "updates").apply { mkdirs() }
            // старые скачанные APK больше не нужны
            dir.listFiles()?.forEach { if (it.name != fileName) it.delete() }
            val target = File(dir, fileName)
            val part = File(dir, "$fileName.part")
            var conn: HttpURLConnection? = null
            try {
                conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = true
                    connectTimeout = 20000
                    readTimeout = 30000
                    setRequestProperty("User-Agent", "AnixApp-Mobile-Updater")
                    setRequestProperty("Accept", "application/octet-stream")
                }
                val code = conn.responseCode
                if (code !in 200..299) throw IllegalStateException("HTTP $code")
                val total = conn.contentLengthLong
                var received = 0L
                var lastPercent = -1
                var lastEmit = 0L
                conn.inputStream.use { input ->
                    part.outputStream().use { output ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            if (cancelled.get()) throw InterruptedException("cancelled")
                            val n = input.read(buf)
                            if (n < 0) break
                            output.write(buf, 0, n)
                            received += n
                            val percent = if (total > 0) ((received * 100) / total).toInt() else -1
                            val now = System.currentTimeMillis()
                            if (percent != lastPercent && now - lastEmit > 150) {
                                lastPercent = percent
                                lastEmit = now
                                emitProgress(received, total, percent)
                            }
                        }
                    }
                }
                if (total > 0 && received != total) throw IllegalStateException("Incomplete download")
                target.delete()
                if (!part.renameTo(target)) throw IllegalStateException("Rename failed")
                emitProgress(received, total, 100)
                val out = JSObject()
                out.put("path", target.absolutePath)
                call.resolve(out)
            } catch (e: InterruptedException) {
                part.delete()
                call.reject("cancelled", "CANCELLED")
            } catch (e: Exception) {
                part.delete()
                call.reject(e.message ?: "Download failed")
            } finally {
                conn?.disconnect()
                running = false
            }
        }.start()
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        cancelled.set(true)
        call.resolve()
    }

    @PluginMethod
    fun install(call: PluginCall) {
        val path = call.getString("path")
        val file = path?.let { File(it) }
        val updatesDir = File(context.cacheDir, "updates")
        if (file == null || !file.exists() || file.parentFile?.canonicalPath != updatesDir.canonicalPath) {
            call.reject("File not found")
            return
        }
        val out = JSObject()
        if (!canInstall()) {
            // Android 8+: разрешение «Установка неизвестных приложений» выдаётся пользователем вручную
            try {
                val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            } catch (_: Exception) {}
            out.put("needsPermission", true)
            call.resolve(out)
            return
        }
        try {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            out.put("started", true)
            call.resolve(out)
        } catch (e: Exception) {
            call.reject(e.message ?: "Install failed")
        }
    }

    private fun canInstall(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

    private fun emitProgress(received: Long, total: Long, percent: Int) {
        val ev = JSObject()
        ev.put("received", received)
        ev.put("total", total)
        ev.put("percent", percent)
        notifyListeners("progress", ev)
    }
}
