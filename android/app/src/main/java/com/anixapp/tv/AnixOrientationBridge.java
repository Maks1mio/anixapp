package com.anixapp.tv;

import android.app.Activity;
import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.view.Window;
import android.webkit.JavascriptInterface;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.lang.ref.WeakReference;

/**
 * Ориентация экрана на телефоне.
 *
 * Приложение закреплено в портрете, как Anixart. Плеер в полноэкранном режиме
 * просит горизонталь через window.AnixOrientation.setLandscape(true).
 * На ТВ ориентацию не трогаем вообще.
 */
public class AnixOrientationBridge {
    private final WeakReference<Activity> activityRef;

    public AnixOrientationBridge(Activity activity) {
        this.activityRef = new WeakReference<>(activity);
    }

    public static boolean isTelevision(Context context) {
        PackageManager pm = context.getPackageManager();
        if (pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)) return true;
        UiModeManager ui = (UiModeManager) context.getSystemService(Context.UI_MODE_SERVICE);
        return ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
    }

    /** Портрет по умолчанию; вызывается из MainActivity.onCreate. */
    public static void applyDefault(Activity activity) {
        if (isTelevision(activity)) return;
        activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
    }

    @JavascriptInterface
    public void setLandscape(final boolean landscape) {
        final Activity activity = activityRef.get();
        if (activity == null || isTelevision(activity)) return;
        activity.runOnUiThread(() -> {
            activity.setRequestedOrientation(
                landscape
                    ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
            setImmersive(activity, landscape);
        });
    }

    /** Полноэкранный плеер: прячем статус-бар и навигацию, возврат — свайпом от края. */
    private static void setImmersive(Activity activity, boolean immersive) {
        Window window = activity.getWindow();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        if (immersive) {
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            controller.hide(WindowInsetsCompat.Type.systemBars());
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars());
        }
    }
}
