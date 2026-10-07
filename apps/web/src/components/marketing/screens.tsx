import type { ReactNode } from 'react'

/**
 * Экраны продукта для сайта.
 *
 * Страницы объясняли продукт текстом в одинаковых белых карточках: человек
 * много читал и мало видел. Здесь собраны те же экраны, что и в приложении, —
 * список, карточка, форма, доска, таблица, — только с данными примера.
 *
 * Правило одно: показываем то, что продукт делает. Если экрана такого вида
 * в приложении нет, его нет и здесь — нарисованная возможность хуже
 * ненарисованной, потому что за ней приходят.
 *
 * Данные всюду помечены как пример: `ScreenFrame` подписывает рамку.
 */

/** Телефон или окно: рамка, подпись и содержимое. */
export function ScreenFrame({
  title,
  device = 'phone',
  note,
  children,
}: {
  /** Что за экран: подпись над рамкой, а не заголовок внутри приложения. */
  title: string
  device?: 'phone' | 'desktop'
  /** Короткое пояснение под рамкой. */
  note?: string
  children: ReactNode
}) {
  return (
    /*
     * `min-w-0` на самой рамке обязателен. Без него ячейка сетки растягивается
     * по самому широкому содержимому — длинному названию товара в списке, —
     * и страница на телефоне уезжает вбок целиком. Обрезка (`truncate`) внутри
     * при этом не срабатывает: ей нужна ограниченная ширина сверху.
     */
    <figure className="m-0 min-w-0 max-w-full">
      <figcaption className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[13px] font-medium text-ink">{title}</span>
        <span className="text-[11px] uppercase tracking-wide text-ink-muted">данные примера</span>
      </figcaption>

      <div
        className={`min-w-0 max-w-full overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-soft ${
          device === 'phone' ? 'mx-auto w-full max-w-[19rem]' : ''
        }`}
      >
        {children}
      </div>

      {note ? <p className="mt-2 text-xs leading-relaxed text-ink-muted">{note}</p> : null}
    </figure>
  )
}

/** Шапка экрана приложения — такая же, как в рантайме. */
function ScreenBar({ title, right }: { title: string; right?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-sand-200 px-4 py-3">
      <span className="truncate font-display text-sm font-bold tracking-tight">{title}</span>
      {right ? <span className="shrink-0 text-xs text-ink-muted">{right}</span> : null}
    </div>
  )
}

export type ScreenRow = {
  title: string
  subtitle?: string
  meta?: string
  /** Плашка статуса: цвет берётся из палитры продукта. */
  status?: { label: string; tone?: 'sage' | 'amber' | 'clay' | 'gray' }
}

const TONES = {
  sage: 'bg-sage-100 text-sage-700',
  amber: 'bg-amber-100 text-amber-800',
  clay: 'bg-clay-400/15 text-ink',
  gray: 'bg-sand-100 text-ink-soft',
} as const

/** Список записей: то, с чего начинается почти любое приложение. */
export function ScreenList({
  title,
  right,
  rows,
  empty,
}: {
  title: string
  right?: string
  rows: ScreenRow[]
  empty?: string
}) {
  return (
    <>
      <ScreenBar title={title} right={right} />
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-sand-200">
          {rows.map((row) => (
            <li key={row.title} className="flex items-start gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{row.title}</span>
                {row.subtitle ? (
                  <span className="mt-0.5 block truncate text-xs text-ink-muted">{row.subtitle}</span>
                ) : null}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {row.meta ? <span className="text-xs tabular-nums text-ink-soft">{row.meta}</span> : null}
                {row.status ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[row.status.tone ?? 'gray']}`}
                  >
                    {row.status.label}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** Карточка записи: значения строкой и кнопки действий. */
export function ScreenCard({
  title,
  fields,
  actions,
}: {
  title: string
  fields: { label: string; value: string; strong?: boolean }[]
  actions?: string[]
}) {
  return (
    <>
      <ScreenBar title={title} />
      <dl className="divide-y divide-sand-200">
        {fields.map((field) => (
          <div key={field.label} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <dt className="shrink-0 text-xs text-ink-muted">{field.label}</dt>
            <dd
              className={`min-w-0 truncate text-right text-sm ${
                field.strong ? 'font-semibold text-ink' : 'text-ink-soft'
              }`}
            >
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
      {actions && actions.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-sand-200 px-4 py-3">
          {actions.map((action, index) => (
            <span
              key={action}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                index === 0 ? 'bg-ink text-sand-50' : 'border border-sand-300 text-ink-soft'
              }`}
            >
              {action}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )
}

/** Форма: короткий ввод вместо таблицы на двадцать колонок. */
export function ScreenForm({
  title,
  fields,
  submit,
  hint,
}: {
  title: string
  fields: { label: string; value: string; kind?: 'text' | 'select' | 'number' }[]
  submit: string
  /** Подсказка над кнопкой: расчёт, предупреждение, итог. */
  hint?: ReactNode
}) {
  return (
    <>
      <ScreenBar title={title} />
      <div className="space-y-3 px-4 py-4">
        {fields.map((field) => (
          <label key={field.label} className="block">
            <span className="block text-[11px] font-medium text-ink-soft">{field.label}</span>
            <span
              className={`mt-1 flex items-center justify-between rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm ${
                field.value ? 'text-ink' : 'text-ink-muted'
              }`}
            >
              <span className="truncate">{field.value || '— не выбрано —'}</span>
              {field.kind === 'select' ? (
                <span aria-hidden className="ml-2 shrink-0 text-ink-muted">
                  ▾
                </span>
              ) : null}
            </span>
          </label>
        ))}

        {hint ? <div className="rounded-xl bg-sand-100/80 px-3 py-2.5 text-xs leading-relaxed">{hint}</div> : null}

        <span className="block rounded-xl bg-ink px-4 py-2.5 text-center text-sm font-medium text-sand-50">
          {submit}
        </span>
      </div>
    </>
  )
}

/** Доска по статусам: то же представление, что и в таблице. */
export function ScreenBoard({
  columns,
}: {
  columns: { title: string; count: number; cards: { title: string; meta?: string }[] }[]
}) {
  return (
    <div className="grid gap-3 p-3 sm:grid-cols-3">
      {columns.map((column) => (
        <div key={column.title} className="rounded-xl bg-sand-100/70 p-2.5">
          <p className="flex items-baseline justify-between px-1 pb-2 text-xs font-medium text-ink-soft">
            {column.title}
            <span className="text-ink-muted">{column.count}</span>
          </p>
          <div className="space-y-2">
            {column.cards.map((card) => (
              <div key={card.title} className="rounded-lg border border-sand-200 bg-white px-3 py-2 shadow-soft">
                <p className="truncate text-xs font-medium text-ink">{card.title}</p>
                {card.meta ? <p className="mt-0.5 truncate text-[11px] text-ink-muted">{card.meta}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Таблица, как в редакторе базы.
 *
 * На узком экране не обрезается и не прячется: строки разворачиваются
 * в карточки. Спрятанная под `overflow: hidden` правая часть таблицы —
 * это потерянные данные, а не компактная вёрстка.
 */
export function ScreenTable({
  columns,
  rows,
  caption,
}: {
  columns: string[]
  rows: string[][]
  caption?: string
}) {
  return (
    /*
     * Переключение «таблица ↔ строки» идёт по ширине самой рамки, а не экрана.
     * На странице «Как это работает» такая же таблица стоит в колонке шириной
     * 257 точек: на широком экране она формально «десктопная», а на деле
     * не помещается и получает полосу прокрутки, за которой прячется третья
     * колонка. Считать по ширине окна здесь нечего — считаем по месту, которое
     * рамке действительно досталось.
     */
    <div className="@container">
      <div className="hidden overflow-x-auto @sm:block">
        <table className="w-full text-left text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="border-b border-sand-200 bg-sand-50 text-[11px] uppercase tracking-wide text-ink-muted">
            {/*
              Заголовок переносится, а не удерживает ширину: «Стоимость
              остатка» в узкой рамке добавляла таблице десяток точек,
              и из-за них появлялась полоса прокрутки.
            */}
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-3 py-2.5 font-medium @lg:px-4">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {rows.map((row) => (
              <tr key={row.join('|')}>
                {row.map((cell, index) => (
                  <td
                    key={columns[index]}
                    className={`px-3 py-2.5 @lg:px-4 ${index === 0 ? 'font-medium text-ink' : 'text-ink-soft'}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* В узкой рамке та же таблица строками: ничего не скрыто и не обрезано. */}
      <ul className="divide-y divide-sand-200 @sm:hidden">
        {rows.map((row) => (
          <li key={row.join('|')} className="px-4 py-3">
            <p className="text-sm font-medium text-ink">{row[0]}</p>
            <dl className="mt-1.5 space-y-1">
              {row.slice(1).map((cell, index) => (
                <div key={columns[index + 1]} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-[11px] uppercase tracking-wide text-ink-muted">
                    {columns[index + 1]}
                  </dt>
                  <dd className="min-w-0 text-right text-sm text-ink-soft">{cell}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}
