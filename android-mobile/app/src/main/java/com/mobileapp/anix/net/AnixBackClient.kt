package com.mobileapp.anix.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Резолвинг embed-ссылки в прямую через AnixBack (POST /api/stream/resolve), как в исходном проекте
 * (src/services/stream-resolve.ts). Свой резолвер в обход AnixBack не делаем.
 */
object AnixBackClient {
    @Volatile
    var baseUrl: String = "https://api.anixapp.com"

    data class SkipRange(val start: Int, val end: Int)

    data class Resolved(
        val directUrl: String?,
        val quality: String?,
        /** метка качества ("360", "480", "720") → URL манифеста/файла */
        val qualityMap: Map<String, String>,
        val headers: Map<String, String>,
        val opening: SkipRange?,
        val ending: SkipRange?,
        val error: String?,
    )

    class ResolveException(message: String, val code: String? = null, cause: Throwable? = null) :
        Exception(message, cause)

    suspend fun resolve(embedUrl: String, timeoutMs: Int = 28_000): Resolved = withContext(Dispatchers.IO) {
        val conn = (URL("$baseUrl/api/stream/resolve").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = timeoutMs
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
        }
        try {
            conn.outputStream.use { it.write(JSONObject().put("embedUrl", embedUrl).toString().toByteArray()) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(text) }.getOrNull()
            if (code !in 200..299 || json == null || json.optBoolean("ok", true).not()) {
                throw ResolveException(
                    json?.optString("error")?.takeIf { it.isNotBlank() } ?: "HTTP $code",
                    json?.optString("code"),
                )
            }
            parse(json)
        } finally {
            conn.disconnect()
        }
    }

    private fun parse(json: JSONObject): Resolved {
        val map = LinkedHashMap<String, String>()
        json.optJSONObject("qualityMap")?.let { o ->
            o.keys().forEach { k -> o.optString(k).takeIf { it.isNotBlank() }?.let { map[k] = it } }
        }
        val headers = LinkedHashMap<String, String>()
        json.optJSONObject("downloadHeaders")?.let { o ->
            o.keys().forEach { k -> headers[k] = o.optString(k) }
        }
        val skip = json.optJSONObject("skip")
        return Resolved(
            directUrl = json.optString("directUrl").takeIf { it.isNotBlank() && it != "null" },
            quality = json.optString("quality").takeIf { it.isNotBlank() && it != "null" },
            qualityMap = map,
            headers = headers,
            opening = skip?.optJSONObject("opening")?.toRange(),
            ending = skip?.optJSONObject("ending")?.toRange(),
            error = json.optString("error").takeIf { it.isNotBlank() && it != "null" },
        )
    }

    private fun JSONObject.toRange(): SkipRange? {
        val s = optInt("start", -1)
        val e = optInt("end", -1)
        return if (s >= 0 && e > s) SkipRange(s, e) else null
    }

    /** Порядок выбора по умолчанию: «минимально доступное» (дефолт Anixart). */
    fun pickQuality(map: Map<String, String>, preferred: String?, minimum: Boolean = true): String? {
        if (map.isEmpty()) return null
        if (preferred != null && map.containsKey(preferred)) return preferred
        val sorted = map.keys.sortedBy { it.filter(Char::isDigit).toIntOrNull() ?: Int.MAX_VALUE }
        return if (minimum) sorted.first() else sorted.last()
    }

    /**
     * Для загрузок: точное качество, иначе ближайшее НИЖЕ запрошенного, иначе самое низкое доступное.
     * (pickQuality при отсутствии нужного качества берёт минимальное — для скачивания это слишком грубо.)
     */
    fun pickNearest(map: Map<String, String>, preferred: String?): String? {
        if (map.isEmpty()) return null
        val want = preferred?.filter(Char::isDigit)?.toIntOrNull() ?: return pickQuality(map, preferred, true)
        val keys = map.keys.mapNotNull { k -> k.filter(Char::isDigit).toIntOrNull()?.let { it to k } }.sortedBy { it.first }
        return keys.lastOrNull { it.first <= want }?.second ?: keys.firstOrNull()?.second ?: pickQuality(map, preferred, true)
    }
}
