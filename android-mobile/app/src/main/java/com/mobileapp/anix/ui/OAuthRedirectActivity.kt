package com.mobileapp.anix.ui

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * Принимает возврат из приложения сервиса (vk54701760://, yxa…://) и отдаёт его окну входа —
 * как RedirectUriReceiverActivity у VK ID и ChromeTabDataActivity у Яндекса в Anixart.
 * Без начатого входа такие ссылки игнорируются.
 */
class OAuthRedirectActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val uri = intent?.data
        if (uri != null && OAuthActivity.isWaiting) {
            startActivity(
                Intent(this, OAuthActivity::class.java)
                    .setData(uri)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            )
        }
        finish()
    }
}
