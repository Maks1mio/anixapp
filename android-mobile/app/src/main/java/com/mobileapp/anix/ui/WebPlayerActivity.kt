package com.mobileapp.anix.ui

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageButton
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.mobileapp.anix.log.AppLog

/**
 * Веб-плеер источника (Kodik и др.) на весь экран — как WebPlayerActivity в Anixart и окно source-web в ПК-версии:
 * страница-обёртка Anixart (anixmirai…/iframe?url=серия) верхним уровнем, Referer — сайт Anixart.
 * Встроить Kodik во фрейм страницы приложения (https://localhost) нельзя: Kodik отвечает «Error code: ds».
 * Переходы на сторонние сайты (реклама) и всплывающие окна блокируются.
 */
class WebPlayerActivity : AppCompatActivity() {
    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_REFERER = "referer"
        const val EXTRA_TITLE = "title"
        const val RESULT_SECONDS = "seconds"

        /** Хосты плеера и его ресурсов; остальное — реклама/уход со страницы. */
        private val ALLOWED = Regex(
            "(^|\\.)(kodikplayer\\.com|kodik\\.info|kodik\\.biz|kodik\\.cc|aniqit\\.com|kodik-cdn\\.com|kodik-storage\\.com|" +
                "solodcdn\\.com|anixmirai\\.com|anixart-app\\.com|anixart\\.tv|anixsekai\\.com|sibnet\\.ru|vk\\.com|vkvideo\\.ru|" +
                "ok\\.ru|rutube\\.ru|youtube\\.com|youtube-nocookie\\.com|anilibria\\.top|anilib\\.top|libria\\.fun)$",
            RegexOption.IGNORE_CASE,
        )
    }

    private lateinit var web: WebView
    private lateinit var root: FrameLayout
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null
    private val startedAt = System.currentTimeMillis()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(EXTRA_URL)
        val scheme = url?.let { Uri.parse(it).scheme?.lowercase() }
        if (url == null || (scheme != "https" && scheme != "http")) { finish(); return }
        val referer = intent.getStringExtra(EXTRA_REFERER)?.takeIf { it.startsWith("https://") }

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.decorView.setBackgroundColor(Color.BLACK)
        hideBars()

        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        web = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.setSupportMultipleWindows(false)
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                    val u = req.url
                    val s = u.scheme?.lowercase()
                    if (s != "https" && s != "http") {
                        AppLog.w("player", "Веб-плеер: заблокирован переход в другое приложение ($s:)")
                        return true
                    }
                    val host = u.host ?: return true
                    if (!ALLOWED.containsMatchIn(host)) {
                        if (req.isForMainFrame) AppLog.i("player", "Веб-плеер: заблокирован переход на $host")
                        return true
                    }
                    return false
                }

                override fun onReceivedError(view: WebView, req: WebResourceRequest, error: WebResourceError) {
                    if (req.isForMainFrame) {
                        AppLog.e("player", "Веб-плеер: не загрузилась страница ${req.url.host} — ${error.description} (${error.errorCode})")
                    }
                }
            }
            webChromeClient = object : WebChromeClient() {
                // Кнопка «на весь экран» внутри плеера
                override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                    customView?.let { onHideCustomView() }
                    customView = view
                    customCallback = callback
                    root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                    hideBars()
                }

                override fun onHideCustomView() {
                    customView?.let { root.removeView(it) }
                    customView = null
                    customCallback?.onCustomViewHidden()
                    customCallback = null
                    hideBars()
                }
            }
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, true)
        }
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        // «Назад» — маленькая кнопка поверх плеера (как в веб-плеере приложения)
        val dp = resources.displayMetrics.density
        val back = ImageButton(this).apply {
            setImageResource(androidx.appcompat.R.drawable.abc_ic_ab_back_material)
            setColorFilter(Color.WHITE)
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(0x73000000)
            }
            contentDescription = "Назад"
            setOnClickListener { finishWithResult() }
        }
        root.addView(back, FrameLayout.LayoutParams((40 * dp).toInt(), (40 * dp).toInt(), Gravity.TOP or Gravity.START).apply {
            setMargins((12 * dp).toInt(), (12 * dp).toInt(), 0, 0)
        })
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (customView != null) web.webChromeClient?.onHideCustomView() else finishWithResult()
            }
        })

        AppLog.i("player", "Веб-плеер: открыт «${intent.getStringExtra(EXTRA_TITLE) ?: ""}» (${Uri.parse(url).host})")
        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(url, referer?.let { mapOf("Referer" to it) } ?: emptyMap())
    }

    private fun hideBars() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    private fun finishWithResult() {
        val secs = ((System.currentTimeMillis() - startedAt) / 1000).toInt()
        AppLog.i("player", "Веб-плеер: закрыт через $secs с")
        setResult(Activity.RESULT_OK, intent.putExtra(RESULT_SECONDS, secs))
        finish()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideBars()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::web.isInitialized) web.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        if (::web.isInitialized) web.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) web.onResume()
    }

    override fun onDestroy() {
        if (::web.isInitialized) {
            (web.parent as? ViewGroup)?.removeView(web)
            web.destroy()
        }
        super.onDestroy()
    }
}
