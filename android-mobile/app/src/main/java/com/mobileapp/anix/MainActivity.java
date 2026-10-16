package com.mobileapp.anix;

import android.os.Bundle;
import androidx.media3.common.util.UnstableApi;
import com.getcapacitor.BridgeActivity;
import com.mobileapp.anix.plugin.AnixPlayerPlugin;

@UnstableApi
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        installCrashRecorder();
        registerPlugin(AnixPlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /** Вылет Java/Kotlin: сохраняем стек (покажется в «Отладке» при следующем запуске) и отдаём системе. */
    private void installCrashRecorder() {
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        if (prev instanceof CrashRecorder) return;
        Thread.setDefaultUncaughtExceptionHandler(new CrashRecorder(getApplicationContext(), prev));
    }

    static final class CrashRecorder implements Thread.UncaughtExceptionHandler {
        private final android.content.Context ctx;
        private final Thread.UncaughtExceptionHandler prev;

        CrashRecorder(android.content.Context ctx, Thread.UncaughtExceptionHandler prev) {
            this.ctx = ctx;
            this.prev = prev;
        }

        @Override
        public void uncaughtException(Thread t, Throwable e) {
            try {
                java.io.StringWriter sw = new java.io.StringWriter();
                e.printStackTrace(new java.io.PrintWriter(sw));
                String trace = sw.toString();
                if (trace.length() > 4000) trace = trace.substring(0, 4000);
                ctx.getSharedPreferences("anix_log", MODE_PRIVATE).edit()
                    .putString("last_crash", "Поток " + t.getName() + ": " + trace)
                    .putLong("last_crash_ts", System.currentTimeMillis())
                    .commit();
            } catch (Throwable ignored) { }
            if (prev != null) prev.uncaughtException(t, e);
        }
    }
}
