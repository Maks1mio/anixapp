package com.mobileapp.anix.playback

import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.offline.Download
import com.mobileapp.anix.media.HeaderStore
import com.mobileapp.anix.media.MediaEngine
import com.mobileapp.anix.net.AnixBackClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EpisodeSpec(
    val id: String,
    val name: String,
    val embedUrl: String,
    val thumb: String? = null,
)

data class LaunchSpec(
    val title: String,
    val episodes: List<EpisodeSpec>,
    val index: Int = 0,
    val startPositionMs: Long = 0,
    val preferredQuality: String? = null,
    /** Приоритет «минимально доступное» — дефолт Anixart. */
    val preferMinimumQuality: Boolean = true,
    /** Если задан — играем скачанное без обращения к AnixBack. */
    val offlineDownloadId: String? = null,
    val offlineUrl: String? = null,
    /** Скачанные серии: URL из кэша Media3 по индексу серии (пусто — серию берём онлайн через AnixBack). */
    val offlineUrls: List<String?> = emptyList(),
    val backgroundPlayback: Boolean = true,
)

enum class Phase { Idle, Resolving, Ready, Retrying, Failed, Ended }

data class UiState(
    val title: String = "",
    val episodes: List<EpisodeSpec> = emptyList(),
    val index: Int = 0,
    val phase: Phase = Phase.Idle,
    val message: String = "",
    val qualities: List<String> = emptyList(),
    val quality: String? = null,
    val opening: AnixBackClient.SkipRange? = null,
    val ending: AnixBackClient.SkipRange? = null,
    val fromCache: Boolean = false,
    val offlineMode: Boolean = false,
    val retryAttempt: Int = 0,
    /** Секунд до автоперехода; null — нет. */
    val nextCountdown: Int? = null,
    val backgroundPlayback: Boolean = true,
)

/**
 * Состояние и логика воспроизведения живут рядом с плеером (в процессе сервиса), а не в Activity:
 * в фоне/PiP Activity может быть уничтожена, а JS приложения заморожен.
 * Резолвинг ссылок — только через AnixBack.
 */
@UnstableApi
object PlaybackCoordinator {
    private const val TAG = "AnixPlayback"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _player = MutableStateFlow<ExoPlayer?>(null)
    val player: StateFlow<ExoPlayer?> = _player.asStateFlow()

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    private var spec: LaunchSpec? = null
    private var qualityMap: Map<String, String> = emptyMap()
    private var resolveJob: Job? = null
    private var countdownJob: Job? = null
    private var pendingStart: LaunchSpec? = null

    /** Прогресс для возврата в JS. */
    var lastPositionMs: Long = 0
        private set
    var lastDurationMs: Long = 0
        private set
    var completed: Boolean = false
        private set

    private val listener = object : Player.Listener {
        override fun onPlayerError(error: PlaybackException) {
            Log.w(TAG, "player error: ${error.errorCodeName} ${error.message}")
            onWatchdog(error)
        }

        override fun onPlaybackStateChanged(state: Int) {
            val p = _player.value ?: return
            when (state) {
                Player.STATE_READY -> _ui.update {
                    it.copy(phase = Phase.Ready, message = "", retryAttempt = 0)
                }
                Player.STATE_ENDED -> {
                    completed = true
                    lastPositionMs = p.duration.coerceAtLeast(0)
                    _ui.update { it.copy(phase = Phase.Ended) }
                    startNextCountdown()
                }
                else -> Unit
            }
        }
    }

    fun attach(player: ExoPlayer) {
        _player.value = player
        player.addListener(listener)
        pendingStart?.let { pendingStart = null; start(it) }
    }

    fun detach() {
        _player.value?.removeListener(listener)
        _player.value = null
        resolveJob?.cancel()
        countdownJob?.cancel()
    }

    /** Вызывается из Activity: если сервис ещё поднимается, запуск откладывается до attach(). */
    fun start(newSpec: LaunchSpec) {
        if (_player.value == null) {
            pendingStart = newSpec
            return
        }
        spec = newSpec
        completed = false
        _ui.value = UiState(
            title = newSpec.title,
            episodes = newSpec.episodes,
            index = newSpec.index,
            backgroundPlayback = newSpec.backgroundPlayback,
            offlineMode = newSpec.offlineDownloadId != null || newSpec.offlineUrls.any { !it.isNullOrBlank() },
        )
        loadEpisode(newSpec.index, newSpec.startPositionMs, newSpec.preferredQuality)
    }

    fun next() {
        val s = spec ?: return
        if (_ui.value.index + 1 < s.episodes.size) {
            countdownJob?.cancel()
            loadEpisode(_ui.value.index + 1, 0, _ui.value.quality)
        }
    }

    fun previous() {
        if (_ui.value.index > 0) {
            countdownJob?.cancel()
            loadEpisode(_ui.value.index - 1, 0, _ui.value.quality)
        }
    }

    fun cancelAutoNext() {
        countdownJob?.cancel()
        _ui.update { it.copy(nextCountdown = null) }
    }

    /** Смена качества = смена URL с сохранением позиции (как в AnixPlayer). */
    fun setQuality(label: String) {
        val p = _player.value ?: return
        val url = qualityMap[label] ?: return
        val pos = p.currentPosition
        val wasPlaying = p.playWhenReady
        play(url, pos, wasPlaying)
        _ui.update { it.copy(quality = label) }
    }

    fun stopSession() {
        resolveJob?.cancel()
        countdownJob?.cancel()
        _player.value?.let { p ->
            snapshot(p)
            p.stop()
            p.clearMediaItems()
        }
        _ui.value = UiState()
    }

    fun snapshot(player: ExoPlayer? = _player.value) {
        val p = player ?: return
        if (p.mediaItemCount == 0) return
        lastPositionMs = if (completed) lastPositionMs else p.currentPosition.coerceAtLeast(0)
        lastDurationMs = p.duration.coerceAtLeast(0)
    }

    // ---------------------------------------------------------------------------------------

    private fun loadEpisode(index: Int, resumeMs: Long, preferred: String?) {
        val s = spec ?: return
        val ep = s.episodes.getOrNull(index) ?: return
        resolveJob?.cancel()
        completed = false
        _ui.update {
            it.copy(
                index = index, phase = Phase.Resolving, message = "Получаем ссылку…",
                nextCountdown = null, quality = preferred, qualities = emptyList(),
                opening = null, ending = null, retryAttempt = 0,
            )
        }

        // Офлайн-плейлист: серия скачана — играем из кэша без сети и без AnixBack.
        s.offlineUrls.getOrNull(index)?.takeIf { it.isNotBlank() }?.let { url ->
            qualityMap = emptyMap()
            _ui.update { it.copy(phase = Phase.Resolving, message = "Воспроизведение из кэша", fromCache = true, offlineMode = true) }
            play(url, resumeMs, true)
            return
        }

        // Офлайн: скачанное воспроизводим без сети и без AnixBack.
        if (s.offlineDownloadId != null && s.offlineUrl != null && index == s.index) {
            qualityMap = emptyMap()
            _ui.update { it.copy(phase = Phase.Resolving, message = "Воспроизведение из кэша", fromCache = true, offlineMode = true) }
            play(s.offlineUrl, resumeMs, true)
            return
        }

        resolveJob = scope.launch {
            try {
                val r = AnixBackClient.resolve(ep.embedUrl)
                applyResolved(r, index, resumeMs, preferred, s)
            } catch (e: Exception) {
                Log.w(TAG, "resolve failed", e)
                _ui.update { it.copy(phase = Phase.Failed, message = "Не удалось получить ссылку: ${e.message}") }
            }
        }
    }

    private fun applyResolved(
        r: AnixBackClient.Resolved, index: Int, resumeMs: Long, preferred: String?, s: LaunchSpec,
    ) {
        if (r.directUrl == null && r.qualityMap.isEmpty()) {
            _ui.update { it.copy(phase = Phase.Failed, message = r.error ?: "Источник не отдаёт прямую ссылку (embed-only)") }
            return
        }
        qualityMap = r.qualityMap.ifEmpty { mapOf((r.quality ?: "auto") to r.directUrl!!) }
        HeaderStore.headers = r.headers
        val q = AnixBackClient.pickQuality(qualityMap, preferred, s.preferMinimumQuality)
        val url = qualityMap[q] ?: r.directUrl!!
        val sortedQualities = qualityMap.keys.sortedBy { it.filter(Char::isDigit).toIntOrNull() ?: Int.MAX_VALUE }
        val cached = runCatching {
            MediaEngine.downloadManager.downloadIndex.getDownload(downloadId(s.episodes[index].id, q))
                ?.state == Download.STATE_COMPLETED
        }.getOrDefault(false)
        _ui.update {
            it.copy(
                qualities = sortedQualities, quality = q, opening = r.opening, ending = r.ending,
                fromCache = cached, message = if (cached) "Серия скачана — играем из кэша" else "",
            )
        }
        play(url, resumeMs, true)
    }

    private fun play(url: String, positionMs: Long, playWhenReady: Boolean) {
        val p = _player.value ?: return
        val item = MediaItem.Builder()
            .setUri(url)
            .setMimeType(if (url.contains(".m3u8")) MimeTypes.APPLICATION_M3U8 else null)
            .build()
        p.setMediaItem(item, positionMs.coerceAtLeast(0))
        p.prepare()
        p.playWhenReady = playWhenReady
    }

    /** Watchdog: сохранить позицию → перерезолв через AnixBack → вернуться на ту же позицию → backoff. */
    private fun onWatchdog(error: PlaybackException) {
        val p = _player.value ?: return
        val s = spec ?: return
        val state = _ui.value
        val pos = p.currentPosition.coerceAtLeast(0)
        if (state.offlineMode) {
            _ui.update { it.copy(phase = Phase.Failed, message = "Ошибка воспроизведения из кэша: ${error.errorCodeName}") }
            return
        }
        val attempt = state.retryAttempt + 1
        if (attempt > 3) {
            _ui.update {
                it.copy(phase = Phase.Failed, retryAttempt = attempt - 1,
                    message = "Не удаётся продолжить (${error.errorCodeName}). Можно выбрать другой источник озвучки.")
            }
            return
        }
        val backoff = longArrayOf(1_000, 3_000, 8_000)[attempt - 1]
        _ui.update { it.copy(phase = Phase.Retrying, retryAttempt = attempt, message = "Обрыв, повтор $attempt/3…") }
        resolveJob?.cancel()
        resolveJob = scope.launch {
            delay(backoff)
            try {
                val ep = s.episodes[state.index]
                val r = AnixBackClient.resolve(ep.embedUrl)
                val keep = attempt
                applyResolved(r, state.index, pos, state.quality, s)
                _ui.update { it.copy(retryAttempt = keep) }
            } catch (e: Exception) {
                onWatchdog(PlaybackException("resolve: ${e.message}", e, PlaybackException.ERROR_CODE_IO_UNSPECIFIED))
            }
        }
    }

    private fun startNextCountdown() {
        val s = spec ?: return
        if (_ui.value.index + 1 >= s.episodes.size) return
        countdownJob?.cancel()
        countdownJob = scope.launch {
            for (left in 5 downTo 1) {
                _ui.update { it.copy(nextCountdown = left) }
                delay(1_000)
            }
            _ui.update { it.copy(nextCountdown = null) }
            next()
        }
    }

    fun downloadId(episodeId: String, quality: String?) = "$episodeId|${quality ?: "auto"}"
}
