package com.mobileapp.anix

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

/**
 * Firebase-проект официального Anixart: его сервер шлёт пуши в топик пользователя.
 * Настройки заданы здесь, а не через google-services.json, и совпадают с electron/lib/anixart-firebase.js.
 * Инициализация в Application нужна, потому что пуш может поднять процесс при закрытом приложении.
 */
class AnixApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseApp.initializeApp(
                this,
                FirebaseOptions.Builder()
                    .setApplicationId("1:983926366374:android:86c070d43af9c4cd0b5467")
                    .setApiKey("AIzaSyBFPckWOsp0MEqb_1gwszvM1ILdUixM-uw")
                    .setProjectId("anime-ad-eb8b3")
                    .setGcmSenderId("983926366374")
                    .setStorageBucket("anime-ad-eb8b3.appspot.com")
                    .build(),
            )
        }
    }
}
