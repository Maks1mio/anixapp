package com.mobileapp.anix.log

import android.util.Log

/**
 * Нативный журнал: пишет в logcat (тег AnixApp) и копит записи для раздела «Отладка» в вебе.
 * Плагин забирает накопленное (drain) и получает новые записи сразу через [listener].
 */
object AppLog {
    const val TAG = "AnixApp"
    private const val MAX = 200

    data class Entry(val ts: Long, val level: String, val channel: String, val message: String)

    private val buffer = ArrayDeque<Entry>()

    /** Подписчик (плагин): получает запись сразу; если подписчика нет — запись ждёт в буфере. */
    @Volatile var listener: ((Entry) -> Unit)? = null

    fun i(channel: String, message: String) = add("info", channel, message, null)
    fun w(channel: String, message: String, t: Throwable? = null) = add("warn", channel, message, t)
    fun e(channel: String, message: String, t: Throwable? = null) = add("error", channel, message, t)

    private fun add(level: String, channel: String, message: String, t: Throwable?) {
        val text = if (t != null) "$message: ${t.javaClass.simpleName}: ${t.message}" else message
        when (level) {
            "error" -> Log.e(TAG, "[$channel] $message", t)
            "warn" -> Log.w(TAG, "[$channel] $message", t)
            else -> Log.i(TAG, "[$channel] $message")
        }
        val entry = Entry(System.currentTimeMillis(), level, channel, text.take(1500))
        val l = listener
        if (l != null) {
            runCatching { l(entry) }
        } else {
            synchronized(buffer) {
                buffer.addLast(entry)
                while (buffer.size > MAX) buffer.removeFirst()
            }
        }
    }

    /** Забрать записи, накопленные без подписчика. */
    fun drain(): List<Entry> = synchronized(buffer) { buffer.toList().also { buffer.clear() } }
}
