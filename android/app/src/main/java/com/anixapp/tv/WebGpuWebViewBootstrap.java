package com.anixapp.tv;

import android.content.Context;
import android.util.Log;
import android.webkit.WebView;

/**
 * Enables Chromium GPU / WebGPU switches before the first WebView is created.
 */
final class WebGpuWebViewBootstrap {
    private static final String TAG = "AnixWebGpu";
    private static volatile boolean switchesApplied;
    private static volatile String lastError = "";

    private WebGpuWebViewBootstrap() {}

    static void applyEarly() {
        applyEarly(null);
    }

    static void applyEarly(Context context) {
        if (switchesApplied) return;
        synchronized (WebGpuWebViewBootstrap.class) {
            if (switchesApplied) return;
            switchesApplied = tryApply(context);
            Log.i(TAG, "bootstrap switches=" + switchesApplied + " err=" + lastError);
        }
    }

    static boolean wereSwitchesApplied() {
        return switchesApplied;
    }

    static String getLastError() {
        return lastError == null ? "" : lastError;
    }

    private static boolean tryApply(Context context) {
        lastError = "";
        if (tryApplyWithLoader(warmUpWebViewClassLoader(context))) return true;
        if (tryApplyWithLoader(WebView.class.getClassLoader())) return true;
        if (tryApplyWithLoader(WebGpuWebViewBootstrap.class.getClassLoader())) return true;
        if (lastError.isEmpty()) lastError = "CommandLine class not found in any classloader";
        return false;
    }

    private static ClassLoader warmUpWebViewClassLoader(Context context) {
        try {
            if (context != null) {
                WebView.getCurrentWebViewPackage();
            }
            Class<?> factoryClass = Class.forName("android.webkit.WebViewFactory");
            Object provider = factoryClass.getMethod("getProvider").invoke(null);
            if (provider != null) {
                ClassLoader loader = provider.getClass().getClassLoader();
                if (loader != null) return loader;
            }
        } catch (Throwable error) {
            lastError = "WebView warmup: " + error.getMessage();
            Log.w(TAG, "WebView warmup failed", error);
        }
        return WebView.class.getClassLoader();
    }

    private static boolean tryApplyWithLoader(ClassLoader loader) {
        if (loader == null) return false;
        try {
            Class<?> commandLineClass = Class.forName("org.chromium.base.CommandLine", true, loader);
            boolean initialized = isCommandLineInitialized(commandLineClass);

            if (!initialized) {
                commandLineClass
                        .getMethod("init", String[].class)
                        .invoke(null, (Object) buildCommandLineArgs());
            } else {
                Object commandLine = commandLineClass.getMethod("getInstance").invoke(null);
                if (commandLine == null) {
                    lastError = "CommandLine.getInstance() null";
                    return false;
                }
                appendAllSwitches(commandLine);
            }

            if (!verifySwitch(commandLineClass, "ignore-gpu-blocklist")) {
                lastError = "ignore-gpu-blocklist not active after apply";
                return false;
            }
            lastError = "";
            return true;
        } catch (Throwable error) {
            lastError = error.getMessage() == null ? error.toString() : error.getMessage();
            Log.w(TAG, "CommandLine apply failed", error);
            return false;
        }
    }

    private static void appendAllSwitches(Object commandLine) throws Exception {
        for (String arg : buildAppendArgs()) {
            if (!arg.startsWith("--")) continue;
            int eq = arg.indexOf('=');
            if (eq > 2) {
                appendSwitchWithValue(commandLine, arg.substring(2, eq), arg.substring(eq + 1));
            } else {
                appendSwitch(commandLine, arg.substring(2));
            }
        }
    }

    private static boolean verifySwitch(Class<?> commandLineClass, String flag) throws Exception {
        Object commandLine = commandLineClass.getMethod("getInstance").invoke(null);
        if (commandLine == null) return false;
        try {
            Object result = commandLineClass
                    .getMethod("hasSwitch", String.class)
                    .invoke(commandLine, flag);
            return result instanceof Boolean && (Boolean) result;
        } catch (NoSuchMethodException ignored) {
            return true;
        }
    }

    private static String[] buildCommandLineArgs() {
        return new String[] {
            "anixapp",
            "--ignore-gpu-blocklist",
            "--enable-unsafe-webgpu",
            "--in-process-gpu",
            "--enable-gpu-rasterization",
            "--use-webgpu-adapter=opengles",
            "--enable-features=WebGPUService",
        };
    }

    private static String[] buildAppendArgs() {
        return new String[] {
            "--ignore-gpu-blocklist",
            "--enable-unsafe-webgpu",
            "--in-process-gpu",
            "--enable-gpu-rasterization",
            "--use-webgpu-adapter=opengles",
            "--enable-features=WebGPUService",
        };
    }

    private static boolean isCommandLineInitialized(Class<?> commandLineClass) throws Exception {
        try {
            Object result = commandLineClass.getMethod("isInitialized").invoke(null);
            return result instanceof Boolean && (Boolean) result;
        } catch (NoSuchMethodException ignored) {
            Object instance = commandLineClass.getMethod("getInstance").invoke(null);
            return instance != null;
        }
    }

    private static void appendSwitch(Object commandLine, String flag) throws Exception {
        commandLine.getClass().getMethod("appendSwitch", String.class).invoke(commandLine, flag);
    }

    private static void appendSwitchWithValue(Object commandLine, String flag, String value) throws Exception {
        commandLine.getClass()
                .getMethod("appendSwitchWithValue", String.class, String.class)
                .invoke(commandLine, flag, value);
    }
}
