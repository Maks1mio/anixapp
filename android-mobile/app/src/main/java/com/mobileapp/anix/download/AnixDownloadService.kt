package com.mobileapp.anix.download

import android.app.Notification
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadNotificationHelper
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.Scheduler
import com.mobileapp.anix.R
import com.mobileapp.anix.media.MediaEngine

/** Foreground-сервис загрузок (Media3 DownloadService) с уведомлением о прогрессе. */
@UnstableApi
class AnixDownloadService : DownloadService(
    FOREGROUND_ID,
    DEFAULT_FOREGROUND_NOTIFICATION_UPDATE_INTERVAL,
    CHANNEL_ID,
    R.string.download_channel_name,
    0,
) {
    override fun onCreate() {
        MediaEngine.init(this)
        super.onCreate()
    }

    override fun getDownloadManager(): DownloadManager = MediaEngine.downloadManager

    // TODO(этап 4): WorkManagerScheduler для возобновления после смерти процесса.
    override fun getScheduler(): Scheduler? = null

    override fun getForegroundNotification(
        downloads: MutableList<Download>,
        notMetRequirements: Int,
    ): Notification = DownloadNotificationHelper(this, CHANNEL_ID).buildProgressNotification(
        this, R.drawable.ic_stat_download, null, null, downloads, notMetRequirements,
    )

    companion object {
        const val FOREGROUND_ID = 4201
        const val CHANNEL_ID = "anix_downloads"
    }
}
