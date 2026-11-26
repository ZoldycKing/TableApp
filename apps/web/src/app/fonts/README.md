# Локальные шрифты

IBM Plex Sans (оси веса и ширины), IBM Plex Mono и курсив Piazzolla лежат здесь
же и подключаются через `next/font/local`. Наборы ужаты до латиницы и кириллицы
(FontTools `pyftsubset`, woff2). Лицензия — SIL OFL, тексты рядом:
`ibm-plex-OFL.txt`, `ibm-plex-mono-OFL.txt`, `piazzolla-OFL.txt`.

Inter, Unbounded и курсивная Literata поставляются вместе с приложением через
`next/font/local`. Сборка не скачивает CSS или файлы Google Fonts. Файлы сохраняют
полный набор символов исходных шрифтов, включая кириллицу и латиницу.

Источник: [Google Fonts, версия `2c605eeda2de57af2b34822b79986f5140299862`](https://github.com/google/fonts/tree/2c605eeda2de57af2b34822b79986f5140299862/ofl).
Рядом с файлами находятся оригинальные лицензии SIL Open Font License.

| Файл | Исходный файл | SHA-256 исходного TTF |
| --- | --- | --- |
| `inter.woff2` | `ofl/inter/Inter[opsz,wght].ttf` | `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031` |
| `unbounded.woff2` | `ofl/unbounded/Unbounded[wght].ttf` | `323b511be380c8d474ef030686b71aedde501f8d9cd46da558b7c40454372c3f` |
| `literata-italic.woff2` | `ofl/literata/Literata-Italic[opsz,wght].ttf` | `d483dfaeba9cbf4ce71d32a52ee65df82f7e35b15fff8d1011cdb242d1fcd465` |

Конвертация формата без подмножества символов: FontTools 4.64.0, Brotli 1.2.0.
Глифы, имена и вариативные оси исходников сохранены. Эти инструменты нужны
только для обновления файлов; при установке и сборке TableApp они не требуются.

OpenType-наборы `cv05` и `ss01` заданы только в `@font-face` Inter через
`next/font/local.declarations`. Не задавайте их на `body`: номера наборов
не имеют общего значения для разных шрифтов. В Unbounded `ss01` заменяет
обычные цифры на цифры в кружках; Unbounded и Literata используют свои
стандартные глифы.
