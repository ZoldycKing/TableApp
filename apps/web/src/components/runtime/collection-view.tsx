'use client'

import type { Attachment, Field, ScreenOf } from '@tableapp/schema'
import { useMemo } from 'react'
import { formatCell } from '@/lib/format'
import type { TableRow } from '@/lib/table-store'
import type { RelatedTitles } from '@/lib/queries'
import { Icon } from './icons'
import { EmptyState, StatusPill } from './ui'
import { CHOICE_COLORS } from '@/components/views/card'
import type { ListState } from './app-shell'
import { fileUrl, isImage } from '@/components/file-upload'

/**
 * Список записей.
 *
 * Главный рабочий экран приложения: в него смотрят чаще, чем в сводку, и
 * дольше, чем в карточку. Раньше он был голой лентой строк — название, подпись
 * и число, — и на нём нечего было делать: ни найти нужное, ни разобрать по
 * этапам. Всё это приходилось делать глазами.
 *
 * Поэтому над списком стоит панель: сколько записей, поиск по тем колонкам,
 * которые владелец назвал в настройках экрана, и вкладки по колонке статуса.
 *
 * Отбор здесь — **показ, а не право**. Строки уже отобраны на сервере правами
 * и правилами на строки; вкладки и поиск только сужают то, что человеку и так
 * положено, и открыть ими чужое невозможно.
 */

type Collection = ScreenOf<'list'> | ScreenOf<'tiles'>

/**
 * Выгрузка списка.
 *
 * Два формата, потому что нужны оба и по разным поводам. CSV открывают
 * в чём угодно и загружают куда угодно; книгу Excel открывает бухгалтер,
 * и ему нужны ширина колонок и фильтр по шапке, а не голый текст.
 *
 * Это обычные ссылки, а не кнопки с загрузкой в браузере: файл собирает
 * сервер, а значит в него попадёт ровно то, что человеку положено, — и
 * попадёт целиком, даже если список длиннее того, что нарисовано на экране.
 */
function ExportMenu({ href }: { href: string }) {
  const style =
    'rounded-lg px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-sand-100 hover:text-ink'

  return (
    <span className="flex items-center gap-0.5">
      <a href={`${href}&format=xlsx`} download className={style} title="Книга Excel">
        Excel
      </a>
      <a href={`${href}&format=csv`} download className={style} title="Файл CSV">
        CSV
      </a>
    </span>
  )
}

export function CollectionView({
  screen,
  rows,
  fields,
  relatedTitles,
  state,
  onState,
  onOpenRow,
  exportHref,
  showStatusFilters = true,
}: {
  screen: Collection
  rows: TableRow[]
  fields: Field[]
  relatedTitles: RelatedTitles
  /**
   * Отбор хранится в оболочке, а не здесь: этот компонент размонтируется
   * при каждом открытии карточки, и своё состояние он терял бы на «назад».
   */
  state: ListState
  onState: (next: ListState) => void
  onOpenRow: ((rowId: string) => void) | null
  /**
   * Адрес выгрузки этого списка, или `null` — если выгружать некуда.
   *
   * `null` в показе на сайте и в предпросмотре конструктора: там строки
   * ненастоящие или чужие, и файл с ними был бы обманом.
   */
  exportHref: string | null
  showStatusFilters?: boolean
}) {
  const { query, choiceId } = state
  const setQuery = (next: string) => onState({ ...state, query: next })
  const setChoiceId = (next: string | null) => onState({ ...state, choiceId: next })

  const byId = (id: string | null | undefined) => (id ? fields.find((item) => item.id === id) : undefined)
  const titleField = byId(screen.titleFieldId)
  const subtitleField = byId(screen.subtitleFieldId)
  const metaField = byId(screen.metaFieldId)
  const imageField = byId(screen.imageFieldId)
  const statusField = byId(screen.statusFieldId)

  /*
   * Вкладки собираются из вариантов самой колонки, а не из того, что нашлось
   * в строках: пустая вкладка «Отменён» честнее исчезнувшей — по ней видно,
   * что отменённых нет, а не что раздела не существует.
   */
  const tabs = useMemo(() => {
    if (!showStatusFilters || !statusField || (statusField.type !== 'single_select' && statusField.type !== 'multi_select')) {
      return []
    }
    return statusField.options.choices.map((choice) => ({
      ...choice,
      count: rows.filter((row) => hasChoice(row.data[statusField.id], choice.id)).length,
    }))
  }, [showStatusFilters, statusField, rows])

  const searchFields = useMemo(
    () => screen.source.searchFieldIds.map((id) => byId(id)).filter((item): item is Field => Boolean(item)),
    [screen.source.searchFieldIds, fields],
  )

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusField && choiceId && !hasChoice(row.data[statusField.id], choiceId)) return false
      if (needle === '') return true
      return searchFields.some((item) =>
        collectionText(item, row.data[item.id], relatedTitles).toLowerCase().includes(needle),
      )
    })
  }, [rows, query, choiceId, statusField, searchFields, relatedTitles])

  const filtering = query.trim() !== '' || choiceId !== null

  /*
   * Итог по тому, что сейчас на экране.
   *
   * Считается по показанным строкам, а не по всем: вопрос «сколько денег
   * висит в работе» задают, уже нажав вкладку «В работе», и неизменное
   * число рядом с меняющимся списком сбивало бы с толку.
   *
   * Только для числовой колонки справа: складывать сроки или остатки
   * штук бессмысленно, а деньги — ровно то, ради чего в список и смотрят.
   */
  const total = useMemo(() => {
    /*
     * Итог складывают в рабочем списке: «сколько денег висит в работе».
     * В каталоге складывать нечего — сумма несвязанных услуг не значит
     * ничего, и выдавать её за показатель нельзя. Каталог у нас плиткой,
     * рабочий перечень — списком, и это же различие решает здесь.
     */
    if (screen.type === 'tiles') return null
    if (!metaField || metaField.type !== 'number') return null
    if (metaField.options.format !== 'currency') return null
    if (!/^(сумма|итого|стоимость заказа|стоимость ремонта|осталось доплатить)$/i.test(metaField.name.trim())) return null

    const sum = shown.reduce((acc, row) => {
      const value = row.data[metaField.id]
      return acc + (typeof value === 'number' && Number.isFinite(value) ? value : 0)
    }, 0)
    return sum === 0 ? null : formatCell(metaField, sum)
  }, [shown, metaField])

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-sand-200 bg-white shadow-soft">
        <EmptyState
          icon={screen.type === 'tiles' ? 'grid' : 'inbox'}
          title="Здесь пока пусто"
          hint="Записи появятся, как только их добавят. Если ждёте свои — проверьте, что вошли под нужной почтой."
        />
      </div>
    )
  }

  return (
    <div className="@container space-y-3">
      {searchFields.length > 0 || tabs.length > 0 ? (
        <div className="space-y-2.5">
          <div className="flex flex-col gap-2 @min-[560px]:flex-row @min-[560px]:items-center">
            {searchFields.length > 0 ? (
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Поиск по списку</span>
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Поиск: ${searchFields.map((item) => item.name.toLowerCase()).join(', ')}`}
                  className="w-full rounded-xl border border-sand-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ink-muted focus:border-sand-400"
                />
              </label>
            ) : null}

            {/*
              На телефоне счётчик и выгрузка стоят в одну строку под поиском,
              и без разведения по краям «Всего 1 Excel CSV» читается как одна
              подпись. На широком экране строка одна, и разводить нечего.
            */}
            <div className="flex w-full shrink-0 items-center justify-between gap-3 @min-[560px]:w-auto @min-[560px]:justify-end">
              <p className="text-xs text-ink-muted">
                {filtering ? `${shown.length} из ${rows.length}` : `Всего ${rows.length}`}
                {total ? (
                  <>
                    {' · сумма '}
                    {/* Именно «сумма заказов», а не выручка: в неё входит всё,
                        что сейчас в списке, включая отменённое. */}
                    <span className="font-semibold tabular-nums text-ink">{total}</span>
                  </>
                ) : null}
              </p>

              {exportHref ? <ExportMenu href={exportHref} /> : null}
            </div>
          </div>

          {tabs.length > 0 ? (
            /*
             * Вкладки переносятся, а не прокручиваются вбок. Боковая прокрутка
             * дешевле по высоте, но прячет статусы за краем — а полосы
             * прокрутки на телефоне не видно, и о спрятанном никто не узнает.
             */
            <div className="flex flex-wrap gap-1.5">
              <Tab active={choiceId === null} onClick={() => setChoiceId(null)}>
                Все <Count value={rows.length} />
              </Tab>
              {tabs.map((choice) => (
                <Tab
                  key={choice.id}
                  active={choiceId === choice.id}
                  tone={choice.color}
                  onClick={() => setChoiceId(choiceId === choice.id ? null : choice.id)}
                >
                  {choice.name} <Count value={choice.count} />
                </Tab>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-sand-200 bg-white shadow-soft">
          <EmptyState
            icon="search"
            title="Ничего не нашлось"
            hint="Измените запрос или сбросьте фильтры."
            action={
              <button
                type="button"
                onClick={() => onState({ ...state, choiceId: null, query: '' })}
                className="rounded-xl border border-sand-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-sand-50"
              >
                Показать все
              </button>
            }
          />
        </div>
      ) : screen.type === 'tiles' ? (
        <Tiles
          rows={shown}
          titleField={titleField}
          subtitleField={subtitleField}
          metaField={metaField}
          imageField={imageField}
          statusField={statusField}
          relatedTitles={relatedTitles}
          onOpenRow={onOpenRow}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-soft">
          {shown.map((row) => (
            <Row
              key={row.id}
              row={row}
              titleField={titleField}
              subtitleField={subtitleField}
              metaField={metaField}
              imageField={imageField}
              statusField={statusField}
              relatedTitles={relatedTitles}
              onOpen={onOpenRow ? () => onOpenRow(row.id) : null}
            />
          ))}
        </div>
      )}
    </div>
  )
}

type Parts = {
  titleField: Field | undefined
  subtitleField: Field | undefined
  metaField: Field | undefined
  imageField: Field | undefined
  statusField: Field | undefined
  relatedTitles: RelatedTitles
}

/** Related labels are already filtered by server access; never substitute raw row IDs. */
function collectionText(field: Field, value: unknown, relatedTitles: RelatedTitles): string {
  if (field.type !== 'relation') return formatCell(field, value)
  if (!Array.isArray(value)) return ''
  const titles = relatedTitles[field.options.tableId] ?? []
  return value.map(id => titles.find(item => item.id === id)?.title ?? 'Запись недоступна').join(', ')
}

/**
 * Строка списка.
 *
 * Четыре вещи, каждая на своём месте: что это, чьё и когда, на каком этапе,
 * сколько. На узком экране этап и сумма уходят под название — иначе от
 * названия остаётся «Ремонт но…», а именно оно человеку и нужно.
 */
function Row({
  row,
  onOpen,
  titleField,
  subtitleField,
  metaField,
  imageField,
  statusField,
  relatedTitles,
}: Parts & { row: TableRow; onOpen: (() => void) | null }) {
  const title = titleField ? collectionText(titleField, row.data[titleField.id], relatedTitles) : ''
  const subtitle = subtitleField ? collectionText(subtitleField, row.data[subtitleField.id], relatedTitles) : ''
  const meta = metaField ? collectionText(metaField, row.data[metaField.id], relatedTitles) : ''

  return (
    <button
      type="button"
      onClick={onOpen ?? undefined}
      disabled={!onOpen}
      className="group flex w-full items-start gap-3 border-b border-sand-200 px-4 py-3.5 text-left transition-colors last:border-0 hover:bg-sand-50 disabled:cursor-default disabled:hover:bg-transparent @min-[480px]:items-center"
    >
      {imageField ? <Thumb value={row.data[imageField.id]} /> : null}

      <span className="flex min-w-0 flex-1 flex-col gap-1.5 @min-[480px]:flex-row @min-[480px]:items-center @min-[480px]:gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium leading-snug">
            {title || 'Без названия'}
          </span>
          {subtitle ? (
            <span className="mt-0.5 block truncate text-xs text-ink-muted">{subtitle}</span>
          ) : null}
        </span>

        <span className="flex shrink-0 items-center gap-3">
          {statusField ? <StatusPill field={statusField} value={row.data[statusField.id]} /> : null}
          {meta ? (
            <span className="text-sm font-semibold tabular-nums @min-[480px]:w-24 @min-[480px]:text-right">
              {meta}
            </span>
          ) : null}
        </span>
      </span>

      {onOpen ? (
        <Icon
          name="back"
          className="mt-1 size-4 shrink-0 rotate-180 text-ink-muted transition-transform group-hover:translate-x-0.5 @min-[480px]:mt-0"
        />
      ) : null}
    </button>
  )
}

function Tiles({
  rows,
  onOpenRow,
  titleField,
  subtitleField,
  metaField,
  imageField,
  statusField,
  relatedTitles,
}: Parts & { rows: TableRow[]; onOpenRow: ((rowId: string) => void) | null }) {
  /*
   * Подпись бывает двух разных сортов, и место у них разное.
   *
   * Короткая — категория, срок, артикул — работает как надстрочная пометка
   * и стоит над названием. Длинная — описание товара или услуги — читается
   * после названия, и над ним она выглядела бы заголовком, которым не является.
   */
  const описание = subtitleField?.type === 'long_text'

  return (
    <div className="grid grid-cols-1 gap-3 @min-[420px]:grid-cols-2 @min-[720px]:grid-cols-3 @min-[1000px]:grid-cols-4">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onOpenRow?.(row.id)}
          disabled={!onOpenRow}
          className="group flex flex-col overflow-hidden rounded-2xl border border-sand-200 bg-white text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-sand-300 hover:shadow-lift disabled:translate-y-0 disabled:cursor-default"
        >
          {imageField ? <TileImage value={row.data[imageField.id]} /> : null}

          <span className="flex flex-1 flex-col gap-1 p-3.5">
            {subtitleField && !описание ? (
              <span className="truncate text-[11px] uppercase tracking-wide text-ink-muted">
                {collectionText(subtitleField, row.data[subtitleField.id], relatedTitles)}
              </span>
            ) : null}

            <span className="line-clamp-2 text-sm font-semibold leading-snug">
              {titleField ? collectionText(titleField, row.data[titleField.id], relatedTitles) || 'Без названия' : ''}
            </span>

            {subtitleField && описание ? (
              <span className="line-clamp-3 text-xs leading-relaxed text-ink-muted">
                {collectionText(subtitleField, row.data[subtitleField.id], relatedTitles)}
              </span>
            ) : null}

            <span className="mt-auto flex items-center justify-between gap-2 pt-3">
              {statusField ? <StatusPill field={statusField} value={row.data[statusField.id]} /> : <span />}
              {metaField ? (
                <span className="shrink-0 text-[15px] font-bold tabular-nums">
                  {collectionText(metaField, row.data[metaField.id], relatedTitles)}
                </span>
              ) : null}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

function Tab({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean
  tone?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-medium transition-colors @min-[560px]:min-h-9 ${
        active
          ? 'border-transparent bg-ink text-sand-50'
          : `border-sand-200 bg-white hover:border-sand-300 ${tone ? toneText(tone) : ''}`
      }`}
    >
      {children}
    </button>
  )
}

function Count({ value }: { value: number }) {
  return <span className="tabular-nums opacity-60">{value}</span>
}

/** Цвет варианта в неактивной вкладке: по нему статус узнаётся до чтения. */
function toneText(color: string): string {
  const classes = CHOICE_COLORS[color] ?? ''
  return classes.split(' ').find((item) => item.startsWith('text-')) ?? ''
}

function hasChoice(value: unknown, choiceId: string): boolean {
  return Array.isArray(value) ? value.includes(choiceId) : value === choiceId
}


function firstImage(value: unknown): Attachment | undefined {
  const files = Array.isArray(value) ? (value as Attachment[]) : []
  return files.find((file) => isImage(file.mime))
}

/** Маленькое фото в строке списка: узнать товар быстрее, чем прочитать. */
function Thumb({ value }: { value: unknown }) {
  const image = firstImage(value)
  if (!image) return null

  return (
    <img
      src={fileUrl(image.key)}
      alt=""
      loading="lazy"
      className="size-11 shrink-0 rounded-lg border border-sand-200 bg-white object-contain p-0.5"
    />
  )
}

/**
 * Картинка товара в плитке.
 *
 * Товарные фото снимают на белом и обрезать их нельзя — у объектива
 * и так поля. Поэтому вписываем целиком в квадрат, а не заполняем его:
 * лучше поля по бокам, чем срезанный край изделия.
 */
function TileImage({ value }: { value: unknown }) {
  const files = Array.isArray(value) ? (value as Attachment[]) : []
  const image = files.find((file) => isImage(file.mime))

  if (!image) {
    return (
      <span className="flex aspect-square items-center justify-center bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="9" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.5" />
          <path d="m4 17 5-4 4 3 3-2 4 3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }

  return (
    <span className="block aspect-square overflow-hidden bg-white p-2">
      <img
        src={fileUrl(image.key)}
        alt={image.name}
        loading="lazy"
        className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
      />
    </span>
  )
}
