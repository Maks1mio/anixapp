package com.mobileapp.anix;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.media3.common.util.UnstableApi;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import com.mobileapp.anix.plugin.AnixAccelerationPlugin;
import com.mobileapp.anix.plugin.AnixBrowserPlugin;
import com.mobileapp.anix.plugin.AnixOAuthPlugin;
import com.mobileapp.anix.plugin.AnixPlayerPlugin;
import com.mobileapp.anix.plugin.AnixPushPlugin;
import com.mobileapp.anix.plugin.AnixQrPlugin;
import com.mobileapp.anix.plugin.AnixUpdaterPlugin;
import java.util.Locale;

@UnstableApi
public class MainActivity extends BridgeActivity {
    @Override
    protected void attachBaseContext(android.content.Context base) {
        WebGpuWebViewBootstrap.applyEarly(base);
        super.attachBaseContext(base);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        WebGpuWebViewBootstrap.applyEarly(this);
        registerPlugin(AnixPlayerPlugin.class);
        registerPlugin(AnixOAuthPlugin.class);
        registerPlugin(AnixBrowserPlugin.class);
        registerPlugin(AnixPushPlugin.class);
        registerPlugin(AnixQrPlugin.class);
        registerPlugin(AnixAccelerationPlugin.class);
        registerPlugin(AnixUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        drawUnderSystemBars();
    }

    /**
     * Контент во весь экран, под строкой состояния и панелью навигации.
     * Отступы передаём в CSS сами: env(safe-area-inset-*) на WebView младше 140 всегда 0.
     * Клавиатура по-прежнему сжимает WebView, иначе она закрывала бы поля ввода.
     */
    private void drawUnderSystemBars() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
        }

        ViewCompat.setOnApplyWindowInsetsListener(window.getDecorView(), (view, insets) -> {
            boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            int keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            view.setPadding(0, 0, 0, keyboardVisible ? keyboard : 0);
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            publishInsets(bars, keyboardVisible);
            return insets;
        });

        // После загрузки страницы значения нужно выставить заново: прежний документ исчез вместе с ними
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                ViewCompat.requestApplyInsets(getWindow().getDecorView());
            }
        });
    }

    private void publishInsets(Insets bars, boolean keyboardVisible) {
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;
        float density = getResources().getDisplayMetrics().density;
        web.evaluateJavascript(
            String.format(
                Locale.US,
                "(function(s){s.setProperty('--safe-top','%.1fpx');s.setProperty('--safe-right','%.1fpx');s.setProperty('--safe-bottom','%.1fpx');s.setProperty('--safe-left','%.1fpx');})(document.documentElement.style)",
                bars.top / density,
                bars.right / density,
                keyboardVisible ? 0f : bars.bottom / density,
                bars.left / density
            ),
            null
        );
    }
}
