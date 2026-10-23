package com.mobileapp.anix.ui

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Окно входа через сервис (аналог Custom Tab в Anixart и BrowserWindow на desktop):
 * открывает страницу авторизации и возвращает первый адрес, начинающийся с одного из redirect-префиксов.
 * Сам обмен кода на токен делает веб-слой.
 */
class OAuthActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var progress: ProgressBar
    private var prefixes: List<String> = emptyList()
    private var finished = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(EXTRA_URL)
        prefixes = intent.getStringArrayExtra(EXTRA_PREFIXES)?.filter { it.isNotBlank() }.orEmpty()
        if (url.isNullOrBlank() || prefixes.isEmpty()) {
            finishWith(null)
            return
        }

        window.setBackgroundDrawable(ColorDrawable(BG))
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(BG)
        }

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), 0, dp(16), 0)
        }
        val close = TextView(this).apply {
            text = "✕"
            setTextColor(FG)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            gravity = Gravity.CENTER
            contentDescription = "Отмена"
            setOnClickListener { finishWith(null) }
        }
        bar.addView(close, LinearLayout.LayoutParams(dp(48), dp(56)))
        val title = TextView(this).apply {
            text = intent.getStringExtra(EXTRA_TITLE) ?: "Вход"
            setTextColor(FG)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            typeface = Typeface.DEFAULT_BOLD
            maxLines = 1
        }
        bar.addView(title, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(8) })
        root.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)))

        val frame = FrameLayout(this)
        web = WebView(this)
        frame.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = true
        }
        frame.addView(progress, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(4), Gravity.TOP))
        root.addView(frame, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            // Google не пускает встроенные WebView («disallowed_useragent») — представляемся обычным Chrome
            userAgentString = browserUserAgent(userAgentString)
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, true)
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                intercept(request.url.toString())

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                progress.visibility = View.VISIBLE
                intercept(url)
            }

            override fun onPageFinished(view: WebView, url: String) {
                progress.visibility = View.GONE
            }

            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                intercept(url)
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finishWith(null)
            }
        })

        web.loadUrl(url)
    }

    /** true — навигацию не продолжаем (поймали redirect или это чужая схема вроде tg:// / intent://). */
    private fun intercept(url: String): Boolean {
        if (finished) return true
        if (prefixes.any { url.startsWith(it, ignoreCase = true) }) {
            finishWith(url)
            return true
        }
        val scheme = Uri.parse(url).scheme?.lowercase()
        return scheme != "http" && scheme != "https" && scheme != "about" && scheme != "data" && scheme != "javascript"
    }

    private fun finishWith(url: String?) {
        if (finished) return
        finished = true
        if (url != null) setResult(Activity.RESULT_OK, Intent().putExtra(EXTRA_RESULT_URL, url))
        else setResult(Activity.RESULT_CANCELED)
        if (::web.isInitialized) web.stopLoading()
        finish()
    }

    override fun onDestroy() {
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    companion object {
        const val EXTRA_URL = "oauth_url"
        const val EXTRA_TITLE = "oauth_title"
        const val EXTRA_PREFIXES = "oauth_prefixes"
        const val EXTRA_RESULT_URL = "oauth_result_url"

        private val BG = Color.parseColor("#141218")
        private val FG = Color.parseColor("#E6E0E9")

        /** UA WebView без «; wv» и «Version/4.0» — как у Chrome на том же устройстве. */
        fun browserUserAgent(base: String): String =
            base.replace("; wv)", ")").replace(Regex("Version/\\d+\\.\\d+\\s*"), "")
    }
}
