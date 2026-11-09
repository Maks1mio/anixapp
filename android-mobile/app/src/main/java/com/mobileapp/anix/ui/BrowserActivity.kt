package com.mobileapp.anix.ui

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Bundle
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.mobileapp.anix.R

/**
 * Браузер приложения: внешние ссылки открываются здесь, сверху — название страницы и адрес.
 * Сюда их направляет AnixBrowserPlugin; из меню страницу всегда можно унести в системный браузер.
 */
class BrowserActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var root: LinearLayout
    private lateinit var content: FrameLayout
    private lateinit var progress: ProgressBar
    private lateinit var titleView: TextView
    private lateinit var addressView: TextView
    private lateinit var secureIcon: ImageView
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    private val dark: Boolean
        get() = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.dataString
        if (url.isNullOrBlank()) {
            finish()
            return
        }

        val bg = if (dark) COLOR_BG_DARK else COLOR_BG_LIGHT
        val fg = if (dark) COLOR_FG_DARK else COLOR_FG_LIGHT
        val muted = if (dark) COLOR_MUTED_DARK else COLOR_MUTED_LIGHT
        window.setBackgroundDrawable(ColorDrawable(bg))
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }

        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(bg)
        }
        root.addView(buildBar(fg, muted), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(60)))

        content = FrameLayout(this)
        web = WebView(this)
        content.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            visibility = View.GONE
            progressTintList = ColorStateList.valueOf(COLOR_ACCENT)
            progressBackgroundTintList = ColorStateList.valueOf(Color.TRANSPARENT)
        }
        content.addView(progress, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP))
        root.addView(content, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        setupWebView()
        showAddress(url)
        titleView.text = Uri.parse(url).host ?: url

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    fullscreenView != null -> exitFullscreen()
                    web.canGoBack() -> web.goBack()
                    else -> finish()
                }
            }
        })

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(url)
    }

    private fun buildBar(fg: Int, muted: Int): View {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        bar.addView(
            iconButton(R.drawable.ic_browser_close, "Закрыть", fg) { finish() },
            LinearLayout.LayoutParams(dp(56), dp(56)),
        )

        val texts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        titleView = TextView(this).apply {
            setTextColor(fg)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            typeface = Typeface.DEFAULT_BOLD
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }
        texts.addView(titleView)

        val addressRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        secureIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_browser_lock)
            setColorFilter(muted)
        }
        addressRow.addView(secureIcon, LinearLayout.LayoutParams(dp(12), dp(12)).apply { marginEnd = dp(4) })
        addressView = TextView(this).apply {
            setTextColor(muted)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }
        addressRow.addView(addressView)
        texts.addView(addressRow)
        bar.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

        val menu = iconButton(R.drawable.ic_browser_more, "Меню", fg) { }
        menu.setOnClickListener { showMenu(it) }
        bar.addView(menu, LinearLayout.LayoutParams(dp(52), dp(56)))
        return bar
    }

    private fun iconButton(icon: Int, label: String, tint: Int, onClick: () -> Unit): ImageButton =
        ImageButton(this).apply {
            setImageResource(icon)
            setColorFilter(tint)
            contentDescription = label
            val ripple = TypedValue()
            context.theme.resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, ripple, true)
            setBackgroundResource(ripple.resourceId)
            setOnClickListener { onClick() }
        }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            userAgentString = OAuthActivity.browserUserAgent(userAgentString)
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val target = request.url.toString()
                if (isWebScheme(target)) return false
                openAppLink(target) { web.loadUrl(it) }
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                showAddress(url)
            }

            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                showAddress(url)
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }

            override fun onReceivedTitle(view: WebView, title: String?) {
                if (!title.isNullOrBlank()) titleView.text = title
            }

            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                exitFullscreen()
                fullscreenView = view
                fullscreenCallback = callback
                (window.decorView as ViewGroup).addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            }

            override fun onHideCustomView() = exitFullscreen()
        }

        // Файлы WebView сам не скачивает: отдаём системе
        web.setDownloadListener { url, _, _, _, _ -> openOutside(url) }
    }

    private fun exitFullscreen() {
        val view = fullscreenView ?: return
        (window.decorView as ViewGroup).removeView(view)
        fullscreenView = null
        fullscreenCallback?.onCustomViewHidden()
        fullscreenCallback = null
    }

    /** Без https:// и завершающего слэша: так адрес читается и больше помещается. */
    private fun showAddress(url: String) {
        addressView.text = url.removePrefix("https://").removePrefix("http://").removeSuffix("/")
        secureIcon.visibility = if (url.startsWith("https://")) View.VISIBLE else View.GONE
    }

    private fun showMenu(anchor: View) {
        val url = web.url ?: intent.dataString ?: return
        PopupMenu(this, anchor).apply {
            menu.add("Обновить").setOnMenuItemClickListener { web.reload(); true }
            menu.add("Скопировать ссылку").setOnMenuItemClickListener {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("Ссылка", url))
                Toast.makeText(this@BrowserActivity, "Ссылка скопирована", Toast.LENGTH_SHORT).show()
                true
            }
            menu.add("Поделиться").setOnMenuItemClickListener {
                val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
                startActivity(Intent.createChooser(send, null))
                true
            }
            menu.add("Открыть в браузере").setOnMenuItemClickListener { openOutside(url); true }
            show()
        }
    }

    private fun openOutside(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, "Нет приложения для этой ссылки", Toast.LENGTH_LONG).show()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::web.isInitialized) web.saveState(outState)
    }

    override fun onPause() {
        if (::web.isInitialized) web.onPause()
        super.onPause()
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

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private companion object {
        val COLOR_ACCENT = Color.parseColor("#E55353")
        val COLOR_BG_DARK = Color.parseColor("#121212")
        val COLOR_FG_DARK = Color.parseColor("#E0E0E0")
        val COLOR_MUTED_DARK = Color.parseColor("#9E9E9E")
        val COLOR_BG_LIGHT = Color.parseColor("#FAFAFA")
        val COLOR_FG_LIGHT = Color.parseColor("#1C1C1C")
        val COLOR_MUTED_LIGHT = Color.parseColor("#6B6B6B")
    }
}
