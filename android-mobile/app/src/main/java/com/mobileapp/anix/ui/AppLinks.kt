package com.mobileapp.anix.ui

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.widget.Toast

/** Адрес открывается в самом WebView, а не в другом приложении. */
fun isWebScheme(url: String): Boolean = when (Uri.parse(url).scheme?.lowercase()) {
    "http", "https", "about", "data", "javascript", "blob" -> true
    else -> false
}

/**
 * Ссылка со страницы в другое приложение (tg://, vk://, intent://).
 * Как в Chrome: только то, что само объявило себя открываемым из браузера.
 * Если приложения нет — запасная страница из intent-ссылки либо подсказка.
 */
fun Activity.openAppLink(url: String, loadFallback: (String) -> Unit) {
    var fallback: String? = null
    try {
        val target = if (Uri.parse(url).scheme.equals("intent", ignoreCase = true)) {
            Intent.parseUri(url, Intent.URI_INTENT_SCHEME).apply {
                fallback = getStringExtra("browser_fallback_url")
                component = null
                selector = null
            }
        } else {
            Intent(Intent.ACTION_VIEW, Uri.parse(url))
        }
        startActivity(target.addCategory(Intent.CATEGORY_BROWSABLE))
    } catch (_: ActivityNotFoundException) {
        val page = fallback
        if (page != null) loadFallback(page)
        else Toast.makeText(this, "Приложение не установлено", Toast.LENGTH_LONG).show()
    } catch (_: java.net.URISyntaxException) {
        // Битая ссылка: остаёмся на странице
    }
}
