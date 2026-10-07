'use client'

import { useId, useState, type ReactNode } from 'react'
import { CoverArt } from './cover-art'
import { ProductGlyph } from './product-glyph'
import { ScreenBoard, ScreenFrame, ScreenTable, type ScreenRow } from './screens'

/**
 * Живые примеры на сайте.
 *
 * Они переключаются, потому что объясняют ровно то, что нельзя показать
 * одной картинкой: одни и те же данные под разным углом и одни и те же
 * данные разным людям. Всё остальное на страницах — обычная разметка
 * без состояния.
 *
 * Ничего не двигается само. Автоматическая карусель отнимает у человека
 * управление ровно в тот момент, когда он начал вчитываться.
 */

/** Переключатель поверх примера: вкладки с настоящим состоянием. */
function Switch({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: string; name: string }[]
  value: string
  onChange: (id: string) => void
}) {
  const group = useId()

  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            id={`${group}-${option.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
              active
                ? 'bg-ink text-sand-50'
                : 'border border-sand-300 bg-white text-ink-soft hover:border-ink/25 hover:text-ink'
            }`}
          >
            {option.name}
          </button>
        )
      })}
    </div>
  )
}

/* --- Одни данные, четыре представления ----------------------------------- */

type Request = {
  /** Номер заявки: он же связывает все примеры между собой. */
  id: string
  client: string
  what: string
  status: 'Новая' | 'В работе' | 'Готово'
  /** Мастер, если назначен. `null` — ещё не назначили. */
  master: string | null
  /** День сентября — для календаря. */
  day: number
  date: string
  sum: string
}

/**
 * Пять заявок — один набор на все примеры этой страницы.
 *
 * Таблица, доска, календарь, галерея и роли показывают **эти** строки, а не
 * похожие. Раньше у мастера появлялась заявка, которой не было в таблице,
 * и обещание «одни и те же строки» оказывалось неправдой при первом сравнении.
 */
export const REQUESTS: Request[] = [
  { id: '1042', client: 'ООО «Вектор»', what: 'Замена насоса', status: 'В работе', master: 'Сергей', day: 26, date: '26 сентября', sum: '18 500 ₽' },
  { id: '1043', client: 'Кафе «Пион»', what: 'Чистка кондиционеров', status: 'Новая', master: null, day: 27, date: '27 сентября', sum: '9 500 ₽' },
  { id: '1044', client: 'ИП Соколов', what: 'Ремонт холодильника', status: 'Готово', master: 'Андрей', day: 25, date: '25 сентября', sum: '12 000 ₽' },
  { id: '1045', client: 'ООО «Вектор»', what: 'Монтаж вентиляции', status: 'В работе', master: 'Андрей', day: 28, date: '28 сентября', sum: '41 300 ₽' },
  { id: '1046', client: 'Салон «Бриз»', what: 'Диагностика сплит-системы', status: 'Новая', master: null, day: 29, date: '29 сентября', sum: '2 200 ₽' },
]

const title = (item: Request) => `Заявка ${item.id}`

const VIEWS = [
  { id: 'grid', name: 'Таблица' },
  { id: 'kanban', name: 'Доска' },
  { id: 'calendar', name: 'Календарь' },
  { id: 'gallery', name: 'Галерея' },
]

const VIEW_NOTE: Record<string, string> = {
  grid: 'Таблица — чтобы править и сверять. Фильтр, сортировка и группировка настраиваются у каждого представления свои.',
  kanban: 'Доска — чтобы двигать работу. Колонки берутся из колонки выбора, перетащили карточку — статус изменился.',
  calendar: 'Календарь — чтобы видеть загрузку недели. Строки раскладываются по колонке даты.',
  gallery: 'Галерея — чтобы узнавать по фотографии. Обложка берётся из колонки с изображением.',
}

function statusTone(status: Request['status']) {
  if (status === 'Готово') return 'sage' as const
  if (status === 'В работе') return 'amber' as const
  return 'gray' as const
}

export function ViewsDemo() {
  const [view, setView] = useState('grid')

  return (
    <div>
      <Switch label="Представление" options={VIEWS} value={view} onChange={setView} />

      <div className="mt-4">
        <ScreenFrame device="desktop" title="Таблица «Заявки»" note={VIEW_NOTE[view]}>
          {view === 'grid' ? (
            <ScreenTable
              caption="Заявки"
              columns={['Заявка', 'Клиент', 'Что сделать', 'Статус', 'Мастер', 'Выезд', 'Сумма']}
              rows={REQUESTS.map((item) => [
                title(item),
                item.client,
                item.what,
                item.status,
                item.master ?? 'не назначен',
                item.date,
                item.sum,
              ])}
            />
          ) : null}

          {view === 'kanban' ? (
            <ScreenBoard
              columns={(['Новая', 'В работе', 'Готово'] as const).map((status) => {
                const cards = REQUESTS.filter((item) => item.status === status)
                return {
                  title: status,
                  count: cards.length,
                  cards: cards.map((item) => ({
                    title: title(item),
                    meta: `${item.client} · ${item.sum}`,
                  })),
                }
              })}
            />
          ) : null}

          {view === 'calendar' ? <CalendarView /> : null}
          {view === 'gallery' ? <GalleryView /> : null}
        </ScreenFrame>
      </div>
    </div>
  )
}

/**
 * Календарь.
 *
 * На узком экране сеткой из семи колонок читать нечего: в ячейку шириной
 * сорок точек помещается «За…». Поэтому на телефоне — повестка по дням,
 * а сетка появляется там, где в неё что-то влезает.
 */
function CalendarView() {
  const days = [25, 26, 27, 28, 29, 30, 1]
  const weekday = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
  const on = (day: number) => REQUESTS.filter((item) => item.day === day)

  return (
    <>
      {/* Повестка: день, дата и что в этот день назначено. */}
      <ul className="divide-y divide-sand-200 sm:hidden">
        {days
          .map((day, index) => ({ day, name: weekday[index]!, items: on(day) }))
          .filter((cell) => cell.items.length > 0)
          .map((cell) => (
            <li key={cell.day} className="px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">
                {cell.name}, {cell.day} сентября
              </p>
              {cell.items.map((item) => (
                <p key={item.id} className="mt-1.5 text-sm">
                  <span className="font-medium text-ink">{title(item)}</span>
                  <span className="text-ink-muted"> · {item.client}</span>
                </p>
              ))}
            </li>
          ))}
      </ul>

      <div className="hidden grid-cols-7 gap-px bg-sand-200 p-px sm:grid">
        {weekday.map((name) => (
          <div
            key={name}
            className="bg-sand-50 px-1 py-1.5 text-center text-[10px] uppercase tracking-wide text-ink-muted"
          >
            {name}
          </div>
        ))}
        {days.map((day) => (
          <div key={day} className="min-h-[4.5rem] bg-white p-1.5">
            <p className="text-[11px] text-ink-muted">{day}</p>
            {on(day).map((item) => (
              <p
                key={item.id}
                className="mt-1 truncate rounded bg-sage-100 px-1 py-0.5 text-[10px] font-medium text-sage-700"
              >
                {title(item)}
              </p>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * Галерея: обложка берётся из колонки с изображением.
 *
 * Снимков примера у нас нет, и вместо них силуэт — выдуманная фотография
 * обещала бы чужую работу. Показаны все пять строк, что и в таблице.
 */
function GalleryView() {
  return (
    <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
      {REQUESTS.map((item, index) => (
        <div key={item.id} className="overflow-hidden rounded-xl border border-sand-200">
          {/*
            Обложка — наш рисунок, а не фотография: снимков чужой работы
            у нас нет. Разные обложки у разных заявок не для красоты —
            одинаковая картинка в пяти карточках читается как заглушка.
          */}
          <div className="bg-sand-100">
            <CoverArt kind={index % 2 === 0 ? 'cooling' : 'tool'} className="h-16 w-full" />
          </div>
          <div className="p-2.5">
            <p className="truncate text-xs font-medium text-ink">{title(item)}</p>
            <p className="mt-0.5 truncate text-[11px] text-ink-muted">{item.client}</p>
            <p className="mt-0.5 text-[11px] tabular-nums text-ink-soft">{item.sum}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/* --- Связи и вычисления --------------------------------------------------- */

const LINES = [
  { name: 'Кондиционер настенный, 09', qty: 2, price: 38_900 },
  { name: 'Монтаж сплит-системы', qty: 2, price: 9_500 },
  { name: 'Доставка по городу', qty: 1, price: 900 },
]

const money = new Intl.NumberFormat('ru-RU')

/**
 * Заказ с позициями: сумма считается сама.
 *
 * Здесь видно обе вещи сразу — подстановку (цена приходит из каталога)
 * и свёртку (итог складывается из позиций). Объяснять это словами дольше,
 * чем показать.
 */
export function ComputedOrderDemo() {
  const [qty, setQty] = useState(LINES.map((line) => line.qty))
  const totals = LINES.map((line, index) => line.price * qty[index]!)
  const sum = totals.reduce((total, value) => total + value, 0)

  return (
    <div>
      <ScreenFrame
        device="desktop"
        title="Таблица «Позиции заказа»"
        note="Цена подставляется из каталога, стоимость строки и итог заказа считаются сами. Поменяйте количество — пересчитается всё, что от него зависит."
      >
        {/*
          Ширина считается по самой рамке: на телефоне ей достаётся около
          350 точек, и таблица с четырьмя колонками и счётчиком уезжала
          за край — часть строки пряталась за полосой прокрутки.
        */}
        <div className="@container overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left text-sm">
            <thead className="border-b border-sand-200 bg-sand-50 text-[11px] uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-medium @lg:px-4">
                  Позиция
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium @lg:px-4">
                  Кол-во
                </th>
                {/*
                  В узкой рамке цена переезжает под название позиции: четыре
                  колонки со счётчиком туда не помещаются, а прятать цену
                  за полосой прокрутки — то же самое, что не показать её вовсе.
                */}
                <th scope="col" className="hidden px-3 py-2.5 font-medium @sm:table-cell @lg:px-4">
                  Цена
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium @lg:px-4">
                  Стоимость
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {LINES.map((line, index) => (
                <tr key={line.name}>
                  <td className="px-3 py-2.5 font-medium text-ink @lg:px-4">
                    {line.name}
                    <span className="mt-0.5 block text-xs font-normal text-ink-muted @sm:hidden">
                      {money.format(line.price)} ₽ · из каталога
                    </span>
                  </td>
                  <td className="px-3 py-2 @lg:px-4">
                    <span className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Уменьшить количество: ${line.name}`}
                        onClick={() =>
                          setQty((current) =>
                            current.map((value, at) => (at === index ? Math.max(1, value - 1) : value)),
                          )
                        }
                        className="flex size-6 items-center justify-center rounded border border-sand-300 text-ink-soft transition-colors hover:border-ink/25 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        −
                      </button>
                      <span className="w-5 text-center tabular-nums">{qty[index]}</span>
                      <button
                        type="button"
                        aria-label={`Увеличить количество: ${line.name}`}
                        onClick={() =>
                          setQty((current) =>
                            current.map((value, at) => (at === index ? Math.min(99, value + 1) : value)),
                          )
                        }
                        className="flex size-6 items-center justify-center rounded border border-sand-300 text-ink-soft transition-colors hover:border-ink/25 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        +
                      </button>
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-ink-muted @sm:table-cell @lg:px-4">
                    {money.format(line.price)} ₽
                    <span className="ml-1.5 rounded bg-sand-100 px-1.5 py-0.5 text-[10px] text-ink-muted">
                      из каталога
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft @lg:px-4">
                    {money.format(totals[index]!)} ₽
                  </td>
                </tr>
              ))}
            </tbody>
            {/*
              Итоговая строка написана дважды: в узкой рамке колонок три,
              в широкой — четыре, а `colSpan` в разметке один и адаптивным
              не бывает. Пара строк честнее, чем таблица, которая на телефоне
              разъезжается на лишнюю колонку.
            */}
            <tfoot>
              <tr className="border-t border-sand-200 bg-sand-50 @sm:hidden">
                <td className="px-3 py-3 text-sm font-medium text-ink" colSpan={2}>
                  Итог заказа
                  <span className="ml-1.5 rounded bg-sage-100 px-1.5 py-0.5 text-[10px] font-medium text-sage-700">
                    считается само
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-display text-base font-bold tabular-nums">
                  {money.format(sum)} ₽
                </td>
              </tr>
              <tr className="hidden border-t border-sand-200 bg-sand-50 @sm:table-row">
                <td className="px-3 py-3 text-sm font-medium text-ink @lg:px-4" colSpan={3}>
                  Итог заказа
                  <span className="ml-1.5 rounded bg-sage-100 px-1.5 py-0.5 text-[10px] font-medium text-sage-700">
                    считается само
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-display text-base font-bold tabular-nums @lg:px-4">
                  {money.format(sum)} ₽
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </ScreenFrame>

      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-sm font-medium text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          Как это устроено в таблице
          <span aria-hidden className="transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink-muted">
          <p>
            <span className="font-medium text-ink">Цена</span> — подстановка: позиция связана
            с каталогом, и цена приходит оттуда. Поменяли цену в каталоге — она поменяется
            во всех новых заказах.
          </p>
          <p>
            <span className="font-medium text-ink">Стоимость</span> — формула{' '}
            <code className="rounded bg-sand-100 px-1 py-0.5 text-xs">{'{Количество} * {Цена}'}</code>.
          </p>
          <p>
            <span className="font-medium text-ink">Итог заказа</span> — свёртка: сумма стоимости
            по всем позициям заказа.
          </p>
        </div>
      </details>
    </div>
  )
}

/* --- Одни данные, разные люди -------------------------------------------- */

type RoleDemo = {
  id: string
  name: string
  screen: string
  lead: string
  rows: ScreenRow[]
  actions: string[]
  hidden: string
}

/**
 * Роли собираются из того же набора заявок.
 *
 * Не отдельные списки: клиент видит свои две строки, мастер — свою одну,
 * владелец — все пять. Раньше у мастера стояла заявка, которой не было
 * в таблице выше, и сравнение рушилось на первом же взгляде.
 */
export const ROLE_VIEWS: RoleDemo[] = [
  {
    id: 'client',
    name: 'Клиент',
    screen: 'Мои заказы',
    lead: 'Вошёл по коду из письма — это ООО «Вектор». Видит заявки своей организации и ничего больше.',
    rows: REQUESTS.filter((item) => item.client === 'ООО «Вектор»').map((item) => ({
      title: title(item),
      subtitle: `${item.what} · выезд ${item.date}`,
      meta: item.sum,
      status: { label: item.status, tone: statusTone(item.status) },
    })),
    actions: ['Открыть заявку'],
    hidden: 'Заявки других клиентов и заметки для своих не приходят в браузер вовсе.',
  },
  {
    id: 'master',
    name: 'Мастер',
    screen: 'Мои выезды',
    lead: 'Сотрудник Сергей с правилом «видит только свои»: из пяти заявок ему открыта одна — его.',
    rows: REQUESTS.filter((item) => item.master === 'Сергей').map((item) => ({
      title: title(item),
      subtitle: `${item.client} · ${item.date}`,
      status: { label: item.status, tone: statusTone(item.status) },
    })),
    actions: ['Отметить «Готово»', 'Приложить фото'],
    hidden: 'Заявки других мастеров ему не открыты, суммы по клиентам тоже.',
  },
  {
    id: 'owner',
    name: 'Владелец',
    screen: 'Все заявки',
    lead: 'Видит все пять: работу обоих мастеров, суммы и то, что ещё никому не назначено.',
    rows: REQUESTS.map((item) => ({
      title: title(item),
      subtitle: `${item.master ?? 'не назначен'} · ${item.client}`,
      meta: item.sum,
      status: { label: item.status, tone: statusTone(item.status) },
    })),
    actions: ['Назначить мастера', 'Изменить сумму'],
    hidden: 'Ограничений нет — это ваша роль.',
  },
]

export function RolesDemo() {
  const [role, setRole] = useState('client')
  const active = ROLE_VIEWS.find((item) => item.id === role)!

  return (
    <div>
      <Switch
        label="Роль"
        options={ROLE_VIEWS.map((item) => ({ id: item.id, name: item.name }))}
        value={role}
        onChange={setRole}
      />

      <div className="mt-4 grid gap-5 sm:grid-cols-[19rem_minmax(0,1fr)] sm:items-start">
        <ScreenFrame title={`Экран роли «${active.name}»`}>
          <ScreenListInline rows={active.rows} title={active.screen} />
        </ScreenFrame>

        <div className="space-y-3 text-sm leading-relaxed">
          <p className="text-ink-soft">{active.lead}</p>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Что может</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {active.actions.map((action) => (
                <li key={action} className="rounded-lg border border-sand-300 bg-white px-2.5 py-1 text-xs text-ink-soft">
                  {action}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-ink-muted">{active.hidden}</p>
        </div>
      </div>
    </div>
  )
}

/** Список внутри рамки — без второй подписи «данные примера». */
function ScreenListInline({ title, rows }: { title: string; rows: ScreenRow[] }): ReactNode {
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-sand-200 px-4 py-3">
        <span className="truncate font-display text-sm font-bold tracking-tight">{title}</span>
        <span className="shrink-0 text-xs text-ink-muted">{rows.length}</span>
      </div>
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
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    row.status.tone === 'sage'
                      ? 'bg-sage-100 text-sage-700'
                      : row.status.tone === 'amber'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-sand-100 text-ink-soft'
                  }`}
                >
                  {row.status.label}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
