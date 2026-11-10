package com.mobileapp.anix;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Настройка «Адаптивное ускорение» (Настройки → Воспроизведение).
 * Хранится в SharedPreferences: читается до создания первого WebView, когда JS ещё не запущен.
 */
public final class AccelerationPrefs {
    private static final String FILE = "anix_acceleration";
    private static final String KEY_ENABLED = "enabled";
    private static volatile boolean appliedThisLaunch;

    private AccelerationPrefs() {}

    public static boolean isEnabled(Context context) {
        if (context == null) return true;
        return prefs(context).getBoolean(KEY_ENABLED, true);
    }

    public static void setEnabled(Context context, boolean enabled) {
        if (context == null) return;
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    /** Были ли GPU-флаги применены при этом запуске (значение могли поменять после старта). */
    public static boolean appliedThisLaunch() {
        return appliedThisLaunch;
    }

    static void markApplied(boolean applied) {
        appliedThisLaunch = applied;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }
}
