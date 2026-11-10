package com.mobileapp.anix.plugin

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.mobileapp.anix.AccelerationPrefs

/**
 * «Адаптивное ускорение» на телефоне: включает GPU-флаги Chromium для WebView (WebGPU → Anime4K).
 * Флаги ставятся до создания WebView, поэтому новое значение действует после перезапуска приложения.
 * Веб: get() → {enabled, applied}; set({enabled}) → {enabled}.
 */
@CapacitorPlugin(name = "AnixAcceleration")
class AnixAccelerationPlugin : Plugin() {
    @PluginMethod
    fun get(call: PluginCall) {
        val out = JSObject()
        out.put("enabled", AccelerationPrefs.isEnabled(context))
        out.put("applied", AccelerationPrefs.appliedThisLaunch())
        call.resolve(out)
    }

    @PluginMethod
    fun set(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        AccelerationPrefs.setEnabled(context, enabled)
        val out = JSObject()
        out.put("enabled", enabled)
        call.resolve(out)
    }
}
