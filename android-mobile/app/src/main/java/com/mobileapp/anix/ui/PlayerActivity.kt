package com.mobileapp.anix.ui

import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import android.util.Rational
import android.view.View
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PictureInPictureAlt
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon as M3Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.mobileapp.anix.media.MediaEngine
import com.mobileapp.anix.playback.EpisodeSpec
import com.mobileapp.anix.playback.LaunchSpec
import com.mobileapp.anix.playback.Phase
import com.mobileapp.anix.playback.PlaybackCoordinator
import com.mobileapp.anix.playback.PlaybackService
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Нативный экран плеера (Compose + Media3). Контракт запуска — JSON в extra "launch":
 * {title, episodes:[{id,name,embedUrl,thumb}], index, startPositionMs, preferredQuality, ...}.
 * Результат: position, duration, completed, quality, index.
 */
@UnstableApi
class PlayerActivity : ComponentActivity() {
    private var inPip by mutableStateOf(false)

    private val pipReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val p = PlaybackCoordinator.player.value ?: return
            when (intent.getStringExtra(EXTRA_PIP_ACTION)) {
                "rew" -> p.seekTo((p.currentPosition - 10_000).coerceAtLeast(0))
                "toggle" -> if (p.isPlaying) p.pause() else p.play()
                "next" -> PlaybackCoordinator.next()
            }
            updatePipParams()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        MediaEngine.init(this)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        startService(Intent(this, PlaybackService::class.java))
        if (savedInstanceState == null) {
            intent.getStringExtra(EXTRA_LAUNCH)?.let { PlaybackCoordinator.start(parseLaunch(it)) }
        }
        ContextCompat.registerReceiver(
            this, pipReceiver, IntentFilter(ACTION_PIP), ContextCompat.RECEIVER_NOT_EXPORTED,
        )

        setContent {
            MaterialTheme(colorScheme = darkColorScheme(background = Color.Black, surface = Color.Black)) {
                PlayerScreen(
                    inPip = inPip,
                    onBack = { finishWithResult() },
                    onEnterPip = { enterPip() },
                )
            }
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        // На API < 31 автоВход не работает — входим в PiP вручную при уходе на домашний экран.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && PlaybackCoordinator.player.value?.isPlaying == true) {
            enterPip()
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        inPip = isInPictureInPictureMode
    }

    override fun onStop() {
        super.onStop()
        val background = PlaybackCoordinator.ui.value.backgroundPlayback
        // Пользователь ушёл не в PiP и фон выключен — ставим на паузу.
        if (!isInPictureInPictureMode && !background && !isFinishing) {
            PlaybackCoordinator.player.value?.pause()
        }
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(pipReceiver) }
        if (isFinishing) {
            // Закрыли окно плеера (в т.ч. крестиком в PiP) — останавливаем и сервис.
            PlaybackCoordinator.snapshot()
            if (!PlaybackCoordinator.ui.value.backgroundPlayback) {
                PlaybackCoordinator.stopSession()
                stopService(Intent(this, PlaybackService::class.java))
            }
        }
        super.onDestroy()
    }

    private fun finishWithResult() {
        PlaybackCoordinator.snapshot()
        val ui = PlaybackCoordinator.ui.value
        val result = Intent().putExtra(
            EXTRA_RESULT,
            JSONObject()
                .put("position", PlaybackCoordinator.lastPositionMs)
                .put("duration", PlaybackCoordinator.lastDurationMs)
                .put("completed", PlaybackCoordinator.completed)
                .put("quality", ui.quality ?: JSONObject.NULL)
                .put("index", ui.index)
                .toString(),
        )
        setResult(RESULT_OK, result)
        PlaybackCoordinator.stopSession()
        stopService(Intent(this, PlaybackService::class.java))
        finish()
    }

    private fun enterPip() {
        runCatching { enterPictureInPictureMode(buildPipParams()) }
    }

    private fun updatePipParams() {
        runCatching { setPictureInPictureParams(buildPipParams()) }
    }

    private fun buildPipParams(): PictureInPictureParams {
        val p = PlaybackCoordinator.player.value
        val playing = p?.isPlaying == true
        val hasNext = PlaybackCoordinator.ui.value.let { it.index + 1 < it.episodes.size }
        val actions = mutableListOf(
            action(android.R.drawable.ic_media_rew, "rew", 1, "−10 с"),
            action(
                if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                "toggle", 2, if (playing) "Пауза" else "Играть",
            ),
        )
        if (hasNext) actions += action(android.R.drawable.ic_media_next, "next", 3, "Следующая")
        val b = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(16, 9))
            .setActions(actions)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            b.setAutoEnterEnabled(playing) // авто-PiP при сворачивании
            b.setSeamlessResizeEnabled(true)
        }
        return b.build()
    }

    private fun action(icon: Int, key: String, code: Int, title: String): RemoteAction {
        val pi = PendingIntent.getBroadcast(
            this, code,
            Intent(ACTION_PIP).setPackage(packageName).putExtra(EXTRA_PIP_ACTION, key),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return RemoteAction(Icon.createWithResource(this, icon), title, title, pi)
    }

    private fun hideSystemBars() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    @androidx.compose.runtime.Composable
    private fun PlayerScreen(inPip: Boolean, onBack: () -> Unit, onEnterPip: () -> Unit) {
        val ui by PlaybackCoordinator.ui.collectAsState()
        val player by PlaybackCoordinator.player.collectAsState()
        var controlsVisible by remember { mutableStateOf(true) }
        var lastTouch by remember { mutableLongStateOf(System.currentTimeMillis()) }
        var holding by remember { mutableStateOf(false) }
        var flash by remember { mutableStateOf("") }
        var isPlaying by remember { mutableStateOf(false) }
        var position by remember { mutableLongStateOf(0) }
        var duration by remember { mutableLongStateOf(0) }
        var buffering by remember { mutableStateOf(false) }
        var menuOpen by remember { mutableStateOf(false) }
        val scope = rememberCoroutineScope()

        BackHandler { onBack() }

        // Опрос состояния плеера для UI и для PiP-кнопок
        DisposableEffect(player) {
            val p = player
            val l = object : Player.Listener {
                override fun onIsPlayingChanged(v: Boolean) { isPlaying = v; updatePipParams() }
                override fun onPlaybackStateChanged(s: Int) { buffering = s == Player.STATE_BUFFERING }
            }
            p?.addListener(l)
            isPlaying = p?.isPlaying == true
            onDispose { p?.removeListener(l) }
        }
        LaunchedEffect(player) {
            while (true) {
                player?.let { position = it.currentPosition; duration = it.duration.coerceAtLeast(0) }
                // автоскрытие контролов через 4000 мс
                if (controlsVisible && isPlaying && !menuOpen && System.currentTimeMillis() - lastTouch > 4000) controlsVisible = false
                delay(250)
            }
        }
        LaunchedEffect(flash) { if (flash.isNotEmpty()) { delay(700); flash = "" } }

        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black)
                .pointerInput(player) {
                    detectTapGestures(
                        onTap = { controlsVisible = !controlsVisible; lastTouch = System.currentTimeMillis() },
                        onDoubleTap = { o: Offset ->
                            val p = player ?: return@detectTapGestures
                            val w = size.width
                            when {
                                o.x < w * 0.35f -> { p.seekTo((p.currentPosition - 10_000).coerceAtLeast(0)); flash = "−10 с" }
                                o.x > w * 0.65f -> { p.seekTo(p.currentPosition + 10_000); flash = "+10 с" }
                                else -> if (p.isPlaying) p.pause() else p.play() // центр: пауза двойным тапом
                            }
                        },
                        onPress = {
                            // Удержание — временная скорость ×2
                            val p = player
                            val job: Job = scope.launch {
                                delay(450)
                                p?.setPlaybackSpeed(2f); holding = true
                            }
                            tryAwaitRelease()
                            job.cancel()
                            if (holding) { p?.setPlaybackSpeed(1f); holding = false }
                        },
                    )
                },
        ) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        useController = false
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                        setShutterBackgroundColor(android.graphics.Color.BLACK)
                        setKeepContentOnPlayerReset(true)
                    }
                },
                update = { it.player = player },
            )

            if (!inPip) {
                StatusOverlay(ui, buffering, holding, flash, onCancelNext = { PlaybackCoordinator.cancelAutoNext() })
                AnimatedControls(
                    visible = controlsVisible,
                    ui = ui, isPlaying = isPlaying, position = position, duration = duration,
                    onTouch = { lastTouch = System.currentTimeMillis() },
                    onMenuOpen = { menuOpen = it },
                    onBack = onBack, onPip = onEnterPip,
                    onToggle = { player?.let { if (it.isPlaying) it.pause() else it.play() } },
                    onSeek = { player?.seekTo(it) },
                )
            }
        }
    }

    @Composable
    private fun StatusOverlay(
        ui: com.mobileapp.anix.playback.UiState, buffering: Boolean, holding: Boolean, flash: String,
        onCancelNext: () -> Unit,
    ) {
        Box(Modifier.fillMaxSize()) {
            val text = when {
                ui.phase == Phase.Resolving -> ui.message
                ui.phase == Phase.Retrying -> ui.message
                ui.phase == Phase.Failed -> ui.message
                buffering -> "Буферизация…"
                holding -> "×2"
                flash.isNotEmpty() -> flash
                ui.fromCache && ui.message.isNotEmpty() -> ui.message
                else -> ""
            }
            if (text.isNotEmpty()) {
                Text(
                    text, color = Color.White, fontSize = 15.sp,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .background(Color(0xCC161616), RoundedCornerShape(20.dp))
                        .padding(horizontal = 18.dp, vertical = 10.dp),
                )
            }
            ui.nextCountdown?.let { n ->
                Row(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 24.dp, bottom = 110.dp)
                        .background(Color(0xE6161616), RoundedCornerShape(20.dp))
                        .padding(start = 18.dp, end = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Следующая серия через $n с", color = Color.White, fontSize = 14.sp)
                    TextButton(onClick = onCancelNext) { Text("Отмена") }
                }
            }
        }
    }

    @Composable
    private fun AnimatedControls(
        visible: Boolean, ui: com.mobileapp.anix.playback.UiState, isPlaying: Boolean,
        position: Long, duration: Long,
        onTouch: () -> Unit, onMenuOpen: (Boolean) -> Unit, onBack: () -> Unit, onPip: () -> Unit,
        onToggle: () -> Unit, onSeek: (Long) -> Unit,
    ) {
        if (!visible) return
        var qualityMenu by remember { mutableStateOf(false) }
        LaunchedEffect(qualityMenu) { onMenuOpen(qualityMenu) }
        var scrub by remember { mutableStateOf<Float?>(null) }
        val epName = ui.episodes.getOrNull(ui.index)?.name.orEmpty()
        Box(Modifier.fillMaxSize()) {
            // Верх: назад, название, N серия ›, качество
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) { M3Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад", tint = Color.White) }
                Column(Modifier.weight(1f).padding(start = 8.dp)) {
                    Text(ui.title, color = Color.White, fontSize = 18.sp, maxLines = 1)
                    Text("$epName ›", color = Color(0xFF9F9F9F), fontSize = 14.sp, maxLines = 1)
                }
                Box {
                    TextButton(onClick = { qualityMenu = true; onTouch() }) {
                        Text(ui.quality?.let { "${it}p" } ?: "—", color = Color.White, fontSize = 16.sp)
                    }
                    DropdownMenu(expanded = qualityMenu, onDismissRequest = { qualityMenu = false }) {
                        ui.qualities.forEach { q ->
                            DropdownMenuItem(
                                text = { Text("${q}p" + if (q == ui.quality) "  ✓" else "") },
                                onClick = { qualityMenu = false; PlaybackCoordinator.setQuality(q) },
                            )
                        }
                    }
                }
            }
            // Центр: назад / плей / вперёд
            Row(
                Modifier.align(Alignment.Center),
                horizontalArrangement = Arrangement.spacedBy(36.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = { PlaybackCoordinator.previous(); onTouch() }, enabled = ui.index > 0) {
                    M3Icon(Icons.Filled.SkipPrevious, "Предыдущая", tint = Color.White, modifier = Modifier.size(40.dp))
                }
                IconButton(onClick = { onToggle(); onTouch() }, modifier = Modifier.size(64.dp)) {
                    M3Icon(if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, "Плей/пауза", tint = Color.White, modifier = Modifier.size(52.dp))
                }
                IconButton(onClick = { PlaybackCoordinator.next(); onTouch() }, enabled = ui.index + 1 < ui.episodes.size) {
                    M3Icon(Icons.Filled.SkipNext, "Следующая", tint = Color.White, modifier = Modifier.size(40.dp))
                }
            }
            // Низ: кнопки и полоса перемотки
            Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                    val inSkip = ui.opening?.let { position / 1000 in it.start..it.end }
                        ?: ui.ending?.let { position / 1000 in it.start..it.end } ?: false
                    val skipTarget = ui.opening?.takeIf { position / 1000 in it.start..it.end }?.end
                        ?: ui.ending?.takeIf { position / 1000 in it.start..it.end }?.end
                    TextButton(onClick = {
                        // «Пропустить» в окне меток, иначе +85 с (дефолт Anixart)
                        onSeek(if (inSkip && skipTarget != null) skipTarget * 1000L else position + 85_000); onTouch()
                    }) {
                        M3Icon(Icons.Filled.FastForward, null, tint = Color.White)
                        Text(if (inSkip) "  Пропустить" else "  +85 с", color = Color.White)
                    }
                    IconButton(onClick = onPip) { M3Icon(Icons.Filled.PictureInPictureAlt, "PiP", tint = Color.White) }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(fmt(position), color = Color.White, fontSize = 14.sp)
                    Slider(
                        modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                        value = scrub ?: if (duration > 0) position.toFloat() / duration else 0f,
                        onValueChange = { scrub = it; onTouch() },
                        onValueChangeFinished = { scrub?.let { onSeek((it * duration).toLong()) }; scrub = null },
                    )
                    Text("-" + fmt((duration - position).coerceAtLeast(0)), color = Color.White, fontSize = 14.sp)
                }
            }
        }
    }

    private fun fmt(ms: Long): String {
        val s = ms / 1000
        return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, s % 3600 / 60, s % 60) else "%02d:%02d".format(s / 60, s % 60)
    }

    companion object {
        const val EXTRA_LAUNCH = "launch"
        const val EXTRA_RESULT = "result"
        const val ACTION_PIP = "com.mobileapp.anix.PIP_ACTION"
        const val EXTRA_PIP_ACTION = "pip_action"

        fun parseLaunch(json: String): LaunchSpec {
            val o = JSONObject(json)
            val eps = o.optJSONArray("episodes")
            val list = (0 until (eps?.length() ?: 0)).map { i ->
                val e = eps!!.getJSONObject(i)
                EpisodeSpec(e.optString("id", i.toString()), e.optString("name"), e.optString("embedUrl"), e.optString("thumb").ifBlank { null })
            }
            return LaunchSpec(
                title = o.optString("title"),
                episodes = list,
                index = o.optInt("index", 0),
                startPositionMs = o.optLong("startPositionMs", 0),
                preferredQuality = o.optString("preferredQuality").ifBlank { null },
                preferMinimumQuality = o.optBoolean("preferMinimumQuality", true),
                offlineDownloadId = o.optString("offlineDownloadId").ifBlank { null },
                offlineUrl = o.optString("offlineUrl").ifBlank { null },
                offlineUrls = o.optJSONArray("offlineUrls")?.let { a -> (0 until a.length()).map { i -> a.optString(i).ifBlank { null } } } ?: emptyList(),
                backgroundPlayback = o.optBoolean("backgroundPlayback", true),
            )
        }
    }
}
