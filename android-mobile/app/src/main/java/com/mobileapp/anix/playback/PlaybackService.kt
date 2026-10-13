package com.mobileapp.anix.playback

import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.mobileapp.anix.media.MediaEngine

/**
 * Держит ExoPlayer и MediaSession: фон с уведомлением, управление с гарнитуры/шторки,
 * пауза при отключении наушников. Плеер переживает Activity (PiP/фон).
 */
@UnstableApi
class PlaybackService : MediaSessionService() {
    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        MediaEngine.init(this)
        val player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(MediaEngine.cacheFactory))
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        // Диагностика плавности: пропуск кадров и недогруз аудио пишем в logcat (тег AnixPerf).
        player.addAnalyticsListener(object : androidx.media3.exoplayer.analytics.AnalyticsListener {
            override fun onDroppedVideoFrames(eventTime: androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime, droppedFrames: Int, elapsedMs: Long) {
                android.util.Log.w("AnixPerf", "dropped $droppedFrames frames in ${elapsedMs}ms")
            }
            override fun onAudioUnderrun(eventTime: androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime, bufferSize: Int, bufferSizeMs: Long, elapsedSinceLastFeedMs: Long) {
                android.util.Log.w("AnixPerf", "audio underrun: buf=${bufferSizeMs}ms sinceFeed=${elapsedSinceLastFeedMs}ms")
            }
            override fun onTracksChanged(eventTime: androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime, tracks: androidx.media3.common.Tracks) {
                val a = tracks.groups.filter { it.type == C.TRACK_TYPE_AUDIO }
                android.util.Log.i("AnixPerf", "audio groups=${a.size} " + a.joinToString { g -> (0 until g.length).joinToString { i -> "${g.getTrackFormat(i).sampleMimeType}/${g.getTrackFormat(i).channelCount}ch/${g.getTrackFormat(i).sampleRate}Hz supported=${g.isTrackSupported(i)}" } })
            }
            override fun onAudioSinkError(eventTime: androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime, audioSinkError: Exception) {
                android.util.Log.e("AnixPerf", "audio sink error", audioSinkError)
            }
            override fun onAudioCodecError(eventTime: androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime, audioCodecError: Exception) {
                android.util.Log.e("AnixPerf", "audio codec error", audioCodecError)
            }
            override fun onVideoDecoderInitialized(eventTime: androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime, decoderName: String, initializedTimestampMs: Long, initializationDurationMs: Long) {
                android.util.Log.i("AnixPerf", "video decoder: $decoderName")
            }
        })
        val s = MediaSession.Builder(this, player).build()
        session = s
        // Activity берёт плеер напрямую (без MediaController), поэтому onGetSession не вызывается:
        // регистрируем сессию явно, иначе Media3 не покажет уведомление и не поднимет foreground.
        addSession(s)
        PlaybackCoordinator.attach(player)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = session?.player
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        PlaybackCoordinator.detach()
        session?.run {
            player.release()
            release()
        }
        session = null
        super.onDestroy()
    }
}
