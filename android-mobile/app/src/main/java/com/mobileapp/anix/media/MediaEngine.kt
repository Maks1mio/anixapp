package com.mobileapp.anix.media

import android.content.Context
import android.net.Uri
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheKeyFactory
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.offline.DefaultDownloadIndex
import androidx.media3.exoplayer.offline.DefaultDownloaderFactory
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.scheduler.Requirements
import java.io.File
import java.util.concurrent.Executors

/**
 * Ключ кэша Media3 по умолчанию строится по полному URL. У Kodik (через AnixBack) между двумя
 * резолвами меняется хост (p12.solodcdn.com ↔ p14.solodcdn.com), а подпись и отметка времени в пути
 * держатся в пределах часа. Поэтому ключ строим только из стабильных частей: id контента + имя файла.
 * Токены/подпись/хост в ключ не попадают — перерезолв и смена зеркала не обнуляют докачку.
 */
@UnstableApi
object StableCacheKey {
    // /s/m/<base64 id>/<hash>:<stamp>/<file>
    private val KODIK = Regex("^/s/m/([^/]+)/[0-9a-f]+:\\d+/(.+)$")

    fun keyFor(spec: DataSpec): String = spec.key ?: keyFor(spec.uri)

    fun keyFor(uri: Uri): String {
        val path = uri.encodedPath
        if (path != null) {
            KODIK.find(path)?.let { return "kodik/${it.groupValues[1]}/${it.groupValues[2]}" }
        }
        return uri.toString()
    }
}

/** Заголовки для текущего источника (Referer/User-Agent из ответа AnixBack: downloadHeaders). */
object HeaderStore {
    @Volatile
    var headers: Map<String, String> = emptyMap()
}

@UnstableApi
object MediaEngine {
    private lateinit var appContext: Context

    fun init(context: Context) {
        if (!::appContext.isInitialized) appContext = context.applicationContext
    }

    val databaseProvider by lazy { StandaloneDatabaseProvider(appContext) }

    /** Внутреннее хранилище приложения; вытеснение отключено (загрузки не должны пропадать). */
    val cache: SimpleCache by lazy {
        SimpleCache(File(appContext.filesDir, "media-cache"), NoOpCacheEvictor(), databaseProvider)
    }

    private val httpFactory by lazy {
        DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000)
    }

    val upstreamFactory: DataSource.Factory by lazy {
        ResolvingDataSource.Factory(DefaultDataSource.Factory(appContext, httpFactory)) { spec ->
            spec.withAdditionalHeaders(HeaderStore.headers)
        }
    }

    /** Единая фабрика для воспроизведения и загрузок — ключи кэша совпадают. */
    val cacheFactory: CacheDataSource.Factory by lazy {
        CacheDataSource.Factory()
            .setCache(cache)
            .setUpstreamDataSourceFactory(upstreamFactory)
            .setCacheKeyFactory(CacheKeyFactory { StableCacheKey.keyFor(it) })
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }

    val downloadManager: DownloadManager by lazy {
        DownloadManager(
            appContext,
            DefaultDownloadIndex(databaseProvider),
            DefaultDownloaderFactory(cacheFactory, Executors.newFixedThreadPool(4)),
        ).apply {
            maxParallelDownloads = 2
            minRetryCount = 5
            requirements = Requirements(Requirements.NETWORK)
        }
    }
}
