package com.mobileapp.anix.plugin

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.mobileapp.anix.ui.OAuthActivity

/**
 * Вход через VK / Google / Telegram / Яндекс.
 * Веб: open({url, title?, redirects: string[]}) → {url} | {cancelled: true}.
 */
@CapacitorPlugin(name = "AnixOAuth")
class AnixOAuthPlugin : Plugin() {
    @PluginMethod
    fun open(call: PluginCall) {
        val url = call.getString("url")
        val redirects = call.getArray("redirects")?.toList<String>().orEmpty()
        if (url.isNullOrBlank() || redirects.isEmpty()) {
            call.reject("url и redirects обязательны")
            return
        }
        val intent = Intent(context, OAuthActivity::class.java)
            .putExtra(OAuthActivity.EXTRA_URL, url)
            .putExtra(OAuthActivity.EXTRA_TITLE, call.getString("title") ?: "Вход")
            .putExtra(OAuthActivity.EXTRA_PREFIXES, redirects.toTypedArray())
        startActivityForResult(call, intent, "oauthResult")
    }

    @ActivityCallback
    private fun oauthResult(call: PluginCall?, result: ActivityResult) {
        val url = result.data?.getStringExtra(OAuthActivity.EXTRA_RESULT_URL)
        if (result.resultCode == Activity.RESULT_OK && url != null) call?.resolve(JSObject().put("url", url))
        else call?.resolve(JSObject().put("cancelled", true))
    }
}
