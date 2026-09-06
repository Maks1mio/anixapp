<p align="center">
  <img src="https://github.com/user-attachments/assets/74f9e25a-6991-4ef2-8e48-7b1f646eeb12" alt="AnixApp" width="920" />
</p>

<p align="center">
  <a href="https://anixapp.com">Сайт</a>
  ·
  <a href="https://t.me/anixapp">Telegram</a>
  ·
  <a href="https://discord.gg/qdFMFxzU9A">Discord</a>
</p>

<h1 align="center">AnixApp</h1>

<p align="center">
  Быстрый десктопный клиент для просмотра аниме на базе Anixart API.
</p>

<p align="center">
  <a href="https://github.com/Maks1mio/anixapp/stargazers"><img src="https://img.shields.io/github/stars/Maks1mio/anixapp?style=flat&color=ff6b9d" alt="Stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Noncommercial-6ea8fe?style=flat" alt="Noncommercial license" /></a>
  <img src="https://img.shields.io/badge/version-0.1.55-informational?style=flat" alt="Version" />
  <img src="https://img.shields.io/badge/Electron-43-47848f?style=flat" alt="Electron" />
  <img src="https://img.shields.io/badge/Svelte-5-ff3e00?style=flat" alt="Svelte" />
  <img src="https://img.shields.io/badge/Android_TV-supported-3ddc84?style=flat&logo=android&logoColor=white" alt="Android TV" />
</p>

> [!WARNING]
> Проект в бета-тестировании: возможны ошибки и нестабильная работа.

---

## Возможности

### Контент

- **Главная** — лента релизов: последние, онгоинги, анонсы, завершённые, фильмы
- **Страница тайтла** — описание, рейтинг, жанры, скриншоты, комментарии, похожие и друзья со статусом просмотра
- **Закладки** — смотрю, в планах, просмотрено, отложено, брошено
- **Коллекции** — тематические подборки и поиск по ним
- **Профиль** — статистика, друзья, списки (свой и чужой)
- **Поиск** — релизы, профили, коллекции с историей запросов
- **Уведомления** — все события аккаунта в одном месте

### Плеер

- Поток через **HLS**, несколько источников: Kodik, Sibnet, Collaps, Anilibria и другие
- Выбор озвучки и серии в плеере
- Следующий эпизод с автоподбором озвучки, если нужно
- Полноэкранный режим и Picture-in-Picture

### Загрузки

- Скачивание серий из плеера (HLS и прямые ссылки)
- Параллельная загрузка HLS для Kodik, Anilibria, Sibnet, Collaps и др.
- Очередь, библиотека файлов, воспроизведение с диска
- Проверка **FFmpeg** и установка portable-сборки для склейки сегментов в MP4

Быстрая HLS-загрузка вдохновлена [Kodik-Download-Watch](https://github.com/YaNesyTortiK/Kodik-Download-Watch) (YaNesyTortiK): параллельные сегменты манифеста и `ffmpeg -c copy`.

### Anime4K

- Апскейл в реальном времени через **WebGPU**
- 20 режимов: пресеты Mode A/B/C и комбинации
- Проверка GPU перед включением

### Discord Rich Presence · бета

- Статус: меню, просмотр аниме, профиль
- Обложка тайтла или аватар в карточке
- Прогресс эпизода
- Лобби: приглашение из Discord и число участников

### Темы · бета

- Авто (системная), тёмная, светлая, AMOLED
- Редактор: цвета, шрифт, предпросмотр
- Сохранение и правка своих тем

### Совместный просмотр · бета

В разработке.

---

## Стек

| Слой | Технология |
| --- | --- |
| Десктоп | Electron 43 |
| UI | Svelte 5 + TypeScript |
| Сборка | Vite 8 |
| Стили | SCSS |
| Видео | hls.js |
| Апскейл | anime4k-webgpu |
| API | Anixart API |
| Discord | @xhayper/discord-rpc |
| Значки | lottie-web |

---

## Платформы

| Платформа | Сборка |
| --- | --- |
| Windows | `.exe` |
| Linux · бета | `.deb`, `.pkg.tar.zst`, AppImage |
| Android TV · бета | APK |

---

## Лицензия

AnixApp распространяется по [PolyForm Noncommercial License 1.0.0](LICENSE): исходный код открыт, пользоваться и собирать можно для себя и в некоммерческих целях. Продажа, реклама внутри приложения и другое коммерческое использование — нет.

---

## Star History

<a href="https://star-history.dera.page/#Maks1mio/anixapp&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=Maks1mio/anixapp&theme=dark&legend=bottom-right" />
   <source media="(prefers-color-scheme: light)" srcset="https://star-history.dera.page/svg?repos=Maks1mio/anixapp&legend=bottom-right" />
   <img alt="Star History Chart" src="https://star-history.dera.page/svg?repos=Maks1mio/anixapp&legend=bottom-right" />
 </picture>
</a>
