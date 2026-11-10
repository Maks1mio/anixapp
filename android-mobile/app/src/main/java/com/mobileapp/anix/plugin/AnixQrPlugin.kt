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
import com.mobileapp.anix.ui.QrScanActivity

/** Веб: scan() → {key} | {cancelled: true} | {denied: true} (нет доступа к камере). */
@CapacitorPlugin(name = "AnixQr")
class AnixQrPlugin : Plugin() {
    @PluginMethod
    fun scan(call: PluginCall) {
        startActivityForResult(call, Intent(context, QrScanActivity::class.java), "scanResult")
    }

    @ActivityCallback
    private fun scanResult(call: PluginCall?, result: ActivityResult) {
        val key = result.data?.getStringExtra(QrScanActivity.EXTRA_KEY)
        val out = JSObject()
        when {
            result.resultCode == Activity.RESULT_OK && key != null -> out.put("key", key)
            result.data?.getBooleanExtra(QrScanActivity.EXTRA_DENIED, false) == true -> out.put("denied", true)
            else -> out.put("cancelled", true)
        }
        call?.resolve(out)
    }
}
