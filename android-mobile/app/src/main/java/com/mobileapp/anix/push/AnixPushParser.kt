package com.mobileapp.anix.push

import org.json.JSONObject

/** Текст уведомления из data-пуша Anixart. Логика и формулировки — как в electron/services/fcm-push-parser.js. */
data class AnixPush(
    val key: String,
    val title: String,
    val body: String,
    val image: String? = null,
    val deepLink: String? = null,
)

object AnixPushParser {
    private const val NO_TITLE = "Без названия"
    private const val SPOILER = "[сообщение скрыто, так как может содержать спойлер]"

    private fun link(type: String, id: Long): String = JSONObject().put("type", type).put("id", id).toString()

    fun parse(data: Map<String, String>): AnixPush? {
        fun str(key: String) = data[key]?.trim().orEmpty()
        fun num(key: String) = str(key).toLongOrNull() ?: 0L
        fun image(key: String) = str(key).ifEmpty { null }
        fun comment() =
            if (str("comment_is_spoiler").equals("true", ignoreCase = true)) SPOILER else str("comment_message").ifEmpty { SPOILER }

        val action = str("action")
        val fallbackKey = "fcm-$action-${System.currentTimeMillis()}"
        return when (action) {
            "ACTION_OPEN_EPISODE" -> {
                val releaseId = num("release_id")
                if (releaseId == 0L) return null
                val release = str("release_title_ru").ifEmpty { NO_TITLE }
                val episode = str("episode_name").ifEmpty { NO_TITLE }
                val type = str("type_name").ifEmpty { NO_TITLE }
                AnixPush(
                    "fcm-episode-$releaseId-$episode",
                    "Новая серия «$release»",
                    "Вышла «$episode» в варианте «$type»",
                    image("release_image"),
                    link("release", releaseId),
                )
            }

            "ACTION_OPEN_RELEASE" -> {
                val releaseId = num("release_id")
                if (releaseId == 0L) return null
                val release = str("release_title_ru").ifEmpty { NO_TITLE }
                AnixPush(
                    "fcm-release-$releaseId",
                    "Новый релиз «$release»",
                    "В приложение была добавлена страница релиза «$release»",
                    image("release_image"),
                    link("release", releaseId),
                )
            }

            "ACTION_OPEN_ARTICLE" -> {
                val articleId = num("article_id")
                if (articleId == 0L) return null
                val channel = str("channel_title").ifEmpty { "канал" }
                val text = stripHtml(str("article_text"))
                AnixPush(
                    "fcm-article-$articleId",
                    if (text.isNotEmpty()) text.take(120) else "Новая запись на канале «$channel»",
                    if (text.isNotEmpty()) "Новая запись на канале «$channel»" else "Нажмите, чтобы посмотреть содержимое",
                    image("article_media_file_url"),
                    link("article", articleId),
                )
            }

            "ACTION_OPEN_RELEASE_COMMENT", "ACTION_OPEN_COLLECTION_COMMENT", "ACTION_OPEN_ARTICLE_COMMENT" -> {
                val login = str("profile_login")
                if (login.isEmpty()) return null
                val commentId = num("comment_id")
                val target = when {
                    action == "ACTION_OPEN_ARTICLE_COMMENT" && num("article_id") != 0L -> link("article", num("article_id"))
                    action == "ACTION_OPEN_COLLECTION_COMMENT" && num("collection_id") != 0L -> link("collection", num("collection_id"))
                    num("release_id") != 0L -> link("release", num("release_id"))
                    else -> null
                }
                AnixPush(
                    if (commentId != 0L) "fcm-comment-$commentId" else fallbackKey,
                    "Ответ на комментарий",
                    "Новый ответ от «$login»: ${comment()}",
                    image("profile_avatar"),
                    target,
                )
            }

            "ACTION_OPEN_MY_COLLECTION_COMMENT" -> {
                val login = str("profile_login")
                val collectionId = num("collection_id")
                if (login.isEmpty() || collectionId == 0L) return null
                val collection = str("collection_title").ifEmpty { "коллекция" }
                AnixPush(
                    "fcm-my-collection-comment-$collectionId-${num("parent_comment_id")}",
                    "Комментарий к вашей коллекции",
                    "Новый комментарий к вашей коллекции «$collection» от «$login»: ${comment()}",
                    image("profile_avatar"),
                    link("collection", collectionId),
                )
            }

            "ACTION_OPEN_MY_ARTICLE_COMMENT" -> {
                val login = str("profile_login")
                val articleId = num("article_id")
                if (login.isEmpty() || articleId == 0L) return null
                val preview = stripHtml(str("article_text"))
                val where = if (preview.isNotEmpty()) " «${preview.take(40)}»" else ""
                AnixPush(
                    "fcm-my-article-comment-$articleId-${num("parent_comment_id")}",
                    "Комментарий к вашей записи",
                    "Новый комментарий к Вашей блоговой записи$where от «$login»: ${comment()}",
                    image("profile_avatar"),
                    link("article", articleId),
                )
            }

            "ACTION_OPEN_PROFILE_FRIEND" -> {
                val profileId = num("profile_id")
                if (profileId == 0L) return null
                val login = str("profile_login").ifEmpty { "Пользователь" }
                val status = str("status")
                val accepted = status == "1"
                AnixPush(
                    "fcm-friend-$profileId-$status",
                    if (accepted) "$login добавил вас в друзья" else "$login хочет добавить вас в друзья",
                    if (accepted) "Пользователь «$login» внёс вас в список своих друзей" else "Пользователь «$login» хочет внести вас в список друзей",
                    image("profile_avatar"),
                    link("profile", profileId),
                )
            }

            "ACTION_ACHIEVEMENT_OBTAINED" -> {
                val name = str("name").ifEmpty { NO_TITLE }
                AnixPush(
                    "fcm-achievement-$name-${str("image_url").takeLast(24)}",
                    "Новое достижение",
                    "«$name»",
                    image("image_url"),
                    link("profile-badge", 0),
                )
            }

            "ACTION_REPORT_PROCESS" -> {
                val type = num("notification_report_type").toInt()
                val release = str("release_title_ru").ifEmpty { "релиз" }
                val commentAuthor = str("comment_profile_login").ifEmpty { "пользователь" }
                val body = when (type) {
                    1 -> "Ваша жалоба на релиз «$release» была успешно обработана модерацией"
                    2, 4 -> "Ваша жалоба на комментарий пользователя «$commentAuthor» была успешно обработана модерацией"
                    3 -> "Ваша жалоба на коллекцию «${str("collection_title").ifEmpty { "коллекция" }}» была успешно обработана модерацией"
                    5 -> "Ваша жалоба на эпизод релиза «$release» была успешно обработана модерацией"
                    6 -> "Ваша жалоба на пользователя «${str("profile_login").ifEmpty { "пользователь" }}» была успешно обработана модерацией"
                    else -> "Ваша жалоба была обработана модерацией"
                }
                val target = when {
                    type == 1 && num("release_id") != 0L -> link("release", num("release_id"))
                    // Anixart передаёт id коллекции в release_id
                    type == 3 && num("release_id") != 0L -> link("collection", num("release_id"))
                    else -> null
                }
                AnixPush(fallbackKey, "Обработка жалобы", body, null, target)
            }

            else -> null
        }
    }

    private fun stripHtml(html: String): String = html
        .replace(Regex("<[^>]+>"), "")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace(Regex("\\s+"), " ")
        .trim()
}
