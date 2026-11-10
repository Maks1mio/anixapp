package com.mobileapp.anix.push

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.net.HttpURLConnection
import java.net.URL

/** Приём пушей Anixart: работает и при закрытом приложении, веб-слой для этого не нужен. */
class AnixPushService : FirebaseMessagingService() {
    /** Подписка на топик привязана к токену: новый токен подписываем заново. */
    override fun onNewToken(token: String) {
        val topic = PushPrefs.topic(this) ?: return
        FirebaseMessaging.getInstance().subscribeToTopic(topic)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (!PushPrefs.enabled(this)) return
        val push = AnixPushParser.parse(message.data)
        if (push == null) {
            Log.i(TAG, "Пропущен пуш: ${message.data["action"]}")
            return
        }
        val body = if (PushPrefs.showPreview(this)) push.body else ""
        AnixNotifications.show(this, push.key, push.title, body, push.deepLink, push.image?.let(::loadImage))
    }

    /** Сервис живёт недолго: картинка не успела загрузиться — уведомление важнее, показываем без неё. */
    private fun loadImage(url: String): Bitmap? = try {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = IMAGE_TIMEOUT_MS
        connection.readTimeout = IMAGE_TIMEOUT_MS
        connection.inputStream.use { BitmapFactory.decodeStream(it) }
    } catch (_: Exception) {
        null
    }

    private companion object {
        const val TAG = "AnixPush"
        const val IMAGE_TIMEOUT_MS = 4000
    }
}

/** Что сервису нужно знать без веб-слоя: топик аккаунта и настройки уведомлений пользователя. */
object PushPrefs {
    private const val FILE = "anix_push"

    private fun prefs(context: Context) = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun topic(context: Context): String? = prefs(context).getString("topic", null)

    fun setTopic(context: Context, topic: String?) = prefs(context).edit().putString("topic", topic).apply()

    fun enabled(context: Context): Boolean = prefs(context).getBoolean("enabled", true)

    fun showPreview(context: Context): Boolean = prefs(context).getBoolean("showPreview", true)

    fun setOptions(context: Context, enabled: Boolean, showPreview: Boolean) =
        prefs(context).edit().putBoolean("enabled", enabled).putBoolean("showPreview", showPreview).apply()
}
