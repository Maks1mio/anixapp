package com.mobileapp.anix.ui

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.mobileapp.anix.R
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Сканер QR-кода для входа на другом устройстве: возвращает key из ссылки anixart://sign-in/qr?key=… */
class QrScanActivity : ComponentActivity() {
    private lateinit var previewView: PreviewView
    private lateinit var hint: TextView
    private lateinit var analysisExecutor: ExecutorService
    private lateinit var scanner: BarcodeScanner
    private var finished = false

    private val requestCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startCamera() else finishWith(Intent().putExtra(EXTRA_DENIED, true), RESULT_CANCELED)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        analysisExecutor = Executors.newSingleThreadExecutor()
        scanner = BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build(),
        )
        setContentView(buildContent())

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            requestCamera.launch(Manifest.permission.CAMERA)
        }
    }

    private fun buildContent(): View {
        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        previewView = PreviewView(this)
        root.addView(previewView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(ScanFrameView(this), FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val close = ImageButton(this).apply {
            setImageResource(R.drawable.ic_browser_close)
            setColorFilter(Color.WHITE)
            contentDescription = "Закрыть"
            val ripple = TypedValue()
            context.theme.resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, ripple, true)
            setBackgroundResource(ripple.resourceId)
            setOnClickListener { finishWith(null, RESULT_CANCELED) }
        }
        bar.addView(close, LinearLayout.LayoutParams(dp(56), dp(56)))
        bar.addView(
            TextView(this).apply {
                text = "Вход по QR"
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
                typeface = Typeface.DEFAULT_BOLD
            },
        )
        root.addView(bar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))

        hint = TextView(this).apply {
            text = HINT_DEFAULT
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            gravity = Gravity.CENTER
            setPadding(dp(32), 0, dp(32), dp(48))
        }
        root.addView(hint, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))

        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            bar.setPadding(bars.left, bars.top, bars.right, 0)
            hint.setPadding(dp(32), 0, dp(32), dp(48) + bars.bottom)
            insets
        }
        return root
    }

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            if (finished || isDestroyed) return@addListener
            try {
                val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .also { it.setAnalyzer(analysisExecutor, ::analyze) }
                future.get().apply {
                    unbindAll()
                    bindToLifecycle(this@QrScanActivity, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                }
            } catch (_: Exception) {
                hint.text = "Не удалось включить камеру"
            }
        }, ContextCompat.getMainExecutor(this))
    }

    @OptIn(ExperimentalGetImage::class)
    @SuppressLint("UnsafeOptInUsageError")
    private fun analyze(frame: ImageProxy) {
        val image = frame.image
        if (image == null || finished) {
            frame.close()
            return
        }
        scanner.process(InputImage.fromMediaImage(image, frame.imageInfo.rotationDegrees))
            .addOnSuccessListener(ContextCompat.getMainExecutor(this)) { codes ->
                val raw = codes.firstOrNull()?.rawValue ?: return@addOnSuccessListener
                val key = parseSignInKey(raw)
                if (key != null) finishWith(Intent().putExtra(EXTRA_KEY, key), RESULT_OK)
                else hint.text = "Это не QR-код для входа в Anixart"
            }
            .addOnCompleteListener { frame.close() }
    }

    private fun finishWith(data: Intent?, code: Int) {
        if (finished) return
        finished = true
        setResult(code, data)
        finish()
    }

    override fun onDestroy() {
        if (::analysisExecutor.isInitialized) analysisExecutor.shutdown()
        if (::scanner.isInitialized) scanner.close()
        super.onDestroy()
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    /** Затемнение с прозрачным окном по центру: куда наводить код. */
    private class ScanFrameView(context: Context) : View(context) {
        private val density = resources.displayMetrics.density
        private val dim = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(150, 0, 0, 0) }
        private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = 2 * density
        }
        private val path = Path()
        private val hole = RectF()

        override fun onDraw(canvas: Canvas) {
            val side = minOf(width, height) * 0.68f
            val radius = 24 * density
            hole.set((width - side) / 2, (height - side) / 2, (width + side) / 2, (height + side) / 2)
            path.reset()
            path.fillType = Path.FillType.EVEN_ODD
            path.addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
            path.addRoundRect(hole, radius, radius, Path.Direction.CW)
            canvas.drawPath(path, dim)
            canvas.drawRoundRect(hole, radius, radius, border)
        }
    }

    companion object {
        const val EXTRA_KEY = "qr_key"
        const val EXTRA_DENIED = "qr_denied"
        private const val HINT_DEFAULT = "Наведите камеру на QR-код на экране другого устройства"

        /** Те же адреса, что принимает Anixart (DeepLinkUtils): anixart://sign-in/qr и https://…/sign-in/qr. */
        fun parseSignInKey(raw: String): String? {
            val uri = try {
                Uri.parse(raw.trim())
            } catch (_: Exception) {
                return null
            }
            if (!uri.isHierarchical) return null
            val path = uri.path?.trimEnd('/')
            val matches = when (uri.scheme?.lowercase()) {
                "anixart" -> uri.authority.equals("sign-in", ignoreCase = true) && path == "/qr"
                "https", "http" -> path == "/sign-in/qr"
                else -> false
            }
            return if (matches) uri.getQueryParameter("key")?.ifBlank { null } else null
        }
    }
}
