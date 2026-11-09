package com.mobileapp.anix.plugin

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.firebase.messaging.FirebaseMessaging
import com.mobileapp.anix.push.PushPrefs

/**
 * Пуши как в официальном Anixart: FCM-токен подписан на топик пользователя из auth/firebase.
 * Веб: sync({topic, enabled, showPreview}) → {active, error?}. topic: null — выход из аккаунта.
 */
@CapacitorPlugin(name = "AnixPush")
class AnixPushPlugin : Plugin() {
    @PluginMethod
    fun sync(call: PluginCall) {
        PushPrefs.setOptions(
            context,
            call.getBoolean("enabled", true) ?: true,
            call.getBoolean("showPreview", true) ?: true,
        )
        val topic = call.getString("topic")?.removePrefix("/topics/")?.trim()?.ifEmpty { null }
        val messaging = FirebaseMessaging.getInstance()

        // Сменился аккаунт: пуши прошлого сюда больше приходить не должны
        val previous = PushPrefs.topic(context)
        if (previous != null && previous != topic) messaging.unsubscribeFromTopic(previous)
        PushPrefs.setTopic(context, topic)

        if (topic == null) {
            call.resolve(JSObject().put("active", false))
            return
        }
        messaging.subscribeToTopic(topic).addOnCompleteListener { task ->
            val result = JSObject().put("active", task.isSuccessful)
            task.exception?.let { result.put("error", it.message ?: it.toString()) }
            call.resolve(result)
        }
    }
}
