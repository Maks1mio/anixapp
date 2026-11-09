package com.mobileapp.anix.plugin

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import com.getcapacitor.Plugin
import com.getcapacitor.annotation.CapacitorPlugin
import com.mobileapp.anix.ui.BrowserActivity

/**
 * Внешние ссылки открывает браузер приложения. Capacitor спрашивает плагины перед тем, как отдать
 * адрес системе, поэтому сюда попадает всё: window.open, target=_blank и обычные переходы.
 */
@CapacitorPlugin(name = "AnixBrowser")
class AnixBrowserPlugin : Plugin() {
    override fun shouldOverrideLoad(url: Uri): Boolean? {
        val scheme = url.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") return null
        if (url.host == Uri.parse(bridge.appUrl).host) return null
        return try {
            activity.startActivity(Intent(context, BrowserActivity::class.java).setData(url))
            true
        } catch (_: ActivityNotFoundException) {
            null
        }
    }
}
