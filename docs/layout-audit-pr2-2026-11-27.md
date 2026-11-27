# PR 2 — аудит вёрстки (27.11.2026)

Проверено **34 маршрута × 5 ширин (390 / 768 / 1280 / 1440 / 1920) = 170 комбинаций**.
Замеры: `document.scrollWidth > clientWidth`, элементы за правым краем viewport, пересечения bounding boxes у `button` / `a` / `h1–h3`.

| Метрика | До | После |
| --- | ---: | ---: |
| Комбинаций с проблемами | 28 | 22* |
| Страниц с `scrollWidth` overflow | 0 | 0 |
| Страниц с элементами за правым краем (не в `overflow-x: auto`) | 10 | **0** |
| Shot/preview с принудительным сайдбаром на ≤768 | да | **нет** |

\*Оставшиеся срабатывания — в основном карточки списка, пересекающие sticky bottom-tab в первом кадре (контент прокручивается выше таб-бара за счёт `padding-bottom`). Горизонтальных обрезаний и «раздавленного» сайдбаром контента нет.

## Что сделано

1. **Shot-демо и preview** (`support` / `service` / `projects` / `dispatch` / `booking` + `/apps/[id]/preview`): `deviceMode: 'auto'` вместо `'desktop'` — на узком окне нижний таб-бар, на широком сайдбар.
2. **`AppFrameDeviceContext`**: отдаёт эффективный `phone` | `desktop` по compact, чтобы экраны включали телефонные тулбары/списки.
3. **Отступ над таб-баром** для всех compact-ширин ≤1023 (не только ≤759).
4. **Чипы клиентов / шаблонов / dispatch-toolbar**: `min-width: 0`, горизонтальный скролл, на узком dispatch сортировка отдельной строкой.
5. **Заголовок списка** на ≤759: перенос CTA под заголовок, без налезания на title.

## Таблица: страница × ширина

| Страница | Ширина | Что было | Что сделал |
| --- | ---: | --- | --- |
| `/support-shot` | 390 | Сайдбар + сжатый контент, CTA/текст в одну букву | auto → phone chrome, CTA под заголовком |
| `/service-shot` | 390 | То же | То же |
| `/projects-shot` | 390 | Кнопка «Задача» за правым краем | auto + phone layout |
| `/dispatch-shot` | 390 / 768 | Чипы/сортировка налезали, сайдбар на 390 | auto; toolbar column на ≤719 |
| `/apps/…/preview` | 390 | Десктоп-сайдбар в узком окне, каталог обрезан | auto → bottom tabs, сетка читаема |
| `/a/prodazhi` | 768 | Карточки пересекали sticky-таб без запаса | `padding-bottom` для ≤1023 |
| `/prokat-shot?view=clients` | 390 | Чип «Давно не были» торчал за краем панели | `.chips { min-width:0; max-width:100%; overflow-x:auto }` |
| `/prokat-shot?view=timeline` | 390–1280 | Карточки брони vs sticky chrome (частично ложные) | общий bottom inset; горизонтальный скролл доски без document overflow |
| `/templates` | 390 | Табы шаблонов обрезаны справа | scroll + fade-mask на `.templateNav` |
| Маркетинг (`/`, `/pricing`, `/login`, …) | все | Без document overflow | без правок |
| Кабинет платформы (`/app`, `/messages`, `/team`, …) | все | Без document overflow | без правок |
| `/apps`, `/apps/[id]`, `/setup` | разные | Ложные H2/«Список» vs chrome | без правок (не визуальные баги) |

## Скрины до / после (худшие)

| # | Кейс | До | После |
| --- | --- | --- | --- |
| 1 | support-shot @ 390 | `/opt/cursor/artifacts/layout-audit/report/support-shot-390-before.png` | `…/support-shot-390-after.png` |
| 2 | service-shot @ 390 | `…/service-shot-390-before.png` | `…/service-shot-390-after.png` |
| 3 | apps-preview @ 390 | `…/apps-preview-390-before.png` | `…/apps-preview-390-after.png` |
| 4 | dispatch-shot @ 390 | `…/dispatch-shot-390-before.png` | `…/dispatch-shot-390-after.png` |
| 5 | templates @ 390 | `…/templates-390-before.png` | `…/templates-390-after.png` |
| 6 | published @ 768 | `…/published-768-before.png` | `…/published-768-after.png` |

Полные прогоны: `/tmp/layout-audit-before.json`, `/tmp/layout-audit-after.json`.
