'use client'

import type { Block, BlockSpan, ScreenOf } from '@tableapp/schema'
import { byPosition } from '@tableapp/schema'
import type { RuntimeApp } from '@/lib/app-runtime'
import type { BlockResult, ListResult, MetricResult, PipelineResult } from '@/lib/dashboard-data'

import { CHOICE_COLORS } from '@/components/views/card'
import { Icon } from './icons'
import { EmptyState } from './ui'
import presentation from './app-presentation.module.css'

/**
 * Сводка.
 *
 * Домашний экран, собранный из блоков: несколько чисел, доска, последние
 * записи, кнопки. Раньше экран всегда был одним списком, и любое приложение
 * выглядело выпиской из таблицы независимо от того, кто его открыл.
 *
 * Компонент **ничего не считает**. Итоги приходят из `runtime.blocks`, где их
 * посчитал сервер по строкам, отобранным правами. Здесь только показ: иначе
 * ради числа «сумма по себестоимости» пришлось бы отправить в браузер саму
 * себестоимость каждой строки.
 */

type Props = {
  screen: ScreenOf<'dashboard'>
  runtime: RuntimeApp
  /**
   * Показ владельцу: в конструкторе и предпросмотре. Только ему видно,
   * что именно в блоке настроено неверно, — клиенту это сообщение
   * рассказало бы об устройстве приложения и всё равно ничего не дало.
   */
  editing?: boolean
  /** `filter` — отбор, с которым открыть список: колонка доски знает свой статус. */
  onOpenScreen: (screenId: string, filter?: { choiceId?: string | null }) => void
  onOpenRow: (screenId: string, rowId: string) => void
}

const TONES: Record<string, string> = {
  ...CHOICE_COLORS,
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-800',
  violet: 'bg-violet-50 text-violet-700',
  teal: 'bg-teal-50 text-teal-700',
  rose: 'bg-rose-50 text-rose-700',
}

/*
 * Ширина блока в сетке из двенадцати колонок.
 *
 * Классы перечислены строками и никогда не собираются из кусков: Tailwind
 * ищет их в исходниках, и `col-span-${n}` в сборку не попадёт. Пороги —
 * контейнерные: приложение меряет своё место, а не окно, поэтому в рамке
 * предпросмотра оно раскладывается как на телефоне.
 */
const MOBILE: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4',
  5: 'col-span-5', 6: 'col-span-6', 7: 'col-span-7', 8: 'col-span-8',
  9: 'col-span-9', 10: 'col-span-10', 11: 'col-span-11', 12: 'col-span-12',
}

const TABLET: Record<number, string> = {
  1: '@min-[560px]:col-span-1', 2: '@min-[560px]:col-span-2', 3: '@min-[560px]:col-span-3',
  4: '@min-[560px]:col-span-4', 5: '@min-[560px]:col-span-5', 6: '@min-[560px]:col-span-6',
  7: '@min-[560px]:col-span-7', 8: '@min-[560px]:col-span-8', 9: '@min-[560px]:col-span-9',
  10: '@min-[560px]:col-span-10', 11: '@min-[560px]:col-span-11', 12: '@min-[560px]:col-span-12',
}

const DESKTOP: Record<number, string> = {
  1: '@min-[900px]:col-span-1', 2: '@min-[900px]:col-span-2', 3: '@min-[900px]:col-span-3',
  4: '@min-[900px]:col-span-4', 5: '@min-[900px]:col-span-5', 6: '@min-[900px]:col-span-6',
  7: '@min-[900px]:col-span-7', 8: '@min-[900px]:col-span-8', 9: '@min-[900px]:col-span-9',
  10: '@min-[900px]:col-span-10', 11: '@min-[900px]:col-span-11', 12: '@min-[900px]:col-span-12',
}

export function spanClass(span: BlockSpan): string {
  const clamp = (value: number) => Math.min(12, Math.max(1, Math.round(value)))
  return `${MOBILE[clamp(span.mobile)]} ${TABLET[clamp(span.tablet)]} ${DESKTOP[clamp(span.desktop)]}`
}

const CARD = `h-full ${presentation.panel}`

/**
 * Размер числа под его длину.
 *
 * Плитка бывает шириной в четверть сетки, и «11 960 ₽» в ней не помещается
 * тем же кеглем, что «2». Обрезать число нельзя — обрезанное число врёт.
 */
function numberSize(text: string): string {
  if (text.length > 11) return 'text-[1.05rem] @min-[560px]:text-[1.2rem]'
  if (text.length > 7) return 'text-[1.25rem] @min-[560px]:text-[1.4rem]'
  return 'text-[1.6rem] @min-[560px]:text-[1.75rem]'
}

function MetricBlock({ block, result }: { block: Extract<Block, { type: 'metric' }>; result: MetricResult }) {
  const up = result.delta !== null && result.delta > 0
  const flat = result.delta !== null && Math.abs(result.delta) < 0.5

  return (
    <div className={`${CARD} flex flex-col p-3.5 @min-[560px]:p-4`}>
      <div className="flex items-center gap-2">
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${TONES[block.tone] ?? TONES.blue}`}>
          <Icon name={block.icon} className="size-4" />
        </span>
        <p className="min-w-0 flex-1 break-words text-xs leading-snug text-ink-muted">{block.title}</p>
      </div>

      <p
        className={`mt-2.5 font-display font-extrabold leading-none tracking-tight tabular-nums ${numberSize(result.text)}`}
      >
        {result.text}
      </p>

      {result.delta !== null ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px]">
          <span className={flat ? 'text-ink-muted' : up ? 'text-green-700' : 'text-red-600'}>
            {flat ? '—' : up ? '▲' : '▼'} {Math.abs(Math.round(result.delta))}%
          </span>
          <span className="truncate text-ink-muted">{result.caption}</span>
        </p>
      ) : (
        <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{result.empty ? result.caption : block.description || result.caption}</p>
      )}
    </div>
  )
}

function ListBlock({
  block,
  result,
  moreLabel,
  onOpenScreen,
  onOpenRow,
}: {
  block: Extract<Block, { type: 'list' }>
  result: ListResult
  /** Название экрана, куда ведёт «Все»: «Все заказы» понятнее, чем «Все». */
  moreLabel: string
  onOpenScreen: (screenId: string) => void
  onOpenRow: (screenId: string, rowId: string) => void
}) {
  return (
    <section className={`${CARD} flex flex-col overflow-hidden`}>
      <header className="flex items-start justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="truncate font-display text-[15px] font-bold tracking-tight">{block.title}</h2>
          {block.description ? (
            <p className="mt-0.5 truncate text-xs text-ink-muted">{block.description}</p>
          ) : null}
        </div>
        {block.moreScreenId ? (
          <button
            type="button"
            onClick={() => onOpenScreen(block.moreScreenId!)}
            className="-my-2 -mr-2 inline-flex min-h-11 shrink-0 items-center px-2 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
          >
            {moreLabel} →
          </button>
        ) : null}
      </header>

      {result.items.length === 0 ? (
        <p className="px-4 pb-5 text-sm text-ink-muted">Пока ничего нет.</p>
      ) : (
        <div className="border-t border-sand-200">
          {result.items.map((item) => (
            <button
              key={item.rowId}
              type="button"
              disabled={!block.onTapScreenId}
              onClick={() => block.onTapScreenId && onOpenRow(block.onTapScreenId, item.rowId)}
              className="flex w-full flex-col gap-1.5 border-b border-sand-200 px-4 py-3 text-left transition-colors last:border-0 hover:bg-sand-50 disabled:cursor-default disabled:hover:bg-transparent @min-[420px]:flex-row @min-[420px]:items-center @min-[420px]:gap-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                {item.subtitle ? (
                  <span className="mt-0.5 block truncate text-xs text-ink-muted">{item.subtitle}</span>
                ) : null}
              </span>

              {/*
               * На узком месте плашка и сумма уходят под название: иначе они
               * отъедают половину строки, и от названия остаётся «Ремонт но…».
               */}
              <span className="flex shrink-0 items-center gap-2.5">
                {item.choice ? (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      CHOICE_COLORS[item.choice.color] ?? CHOICE_COLORS.gray
                    }`}
                  >
                    {item.choice.name}
                  </span>
                ) : null}
                {item.meta ? (
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{item.meta}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function PipelineBlock({
  block,
  result,
  onOpenScreen,
  onOpenRow,
}: {
  block: Extract<Block, { type: 'pipeline' }>
  result: PipelineResult
  onOpenScreen: (screenId: string, filter?: { choiceId?: string | null }) => void
  onOpenRow: (screenId: string, rowId: string) => void
}) {
  return (
    <section className={`${CARD} p-4 @min-[560px]:p-5`}>
      <h2 className="font-display text-[15px] font-bold tracking-tight">{block.title}</h2>
      {block.description ? <p className="mt-0.5 text-xs text-ink-muted">{block.description}</p> : null}

      {result.total === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Пока ничего нет.</p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {result.columns.map((column) => (
            <div key={column.id}>
              <button
                type="button"
                disabled={!block.onTapScreenId}
                /*
                 * Нажали «В работе» — список открывается этой колонкой.
                 * Раньше он открывался целиком, и человек оказывался
                 * в общем перечне, откуда сам искал нужный статус.
                 */
                onClick={() =>
                  block.onTapScreenId && onOpenScreen(block.onTapScreenId, { choiceId: column.id })
                }
                className="flex min-h-11 w-full items-center gap-3 rounded-lg text-left transition-colors hover:bg-sand-50 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span
                  className={`w-32 shrink-0 truncate rounded-full px-2.5 py-1 text-xs font-medium ${
                    CHOICE_COLORS[column.color] ?? CHOICE_COLORS.gray
                  }`}
                >
                  {column.name}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-sand-100">
                  <span
                    className="block h-full rounded-full bg-ink/20"
                    style={{ width: result.total > 0 ? `${Math.round((column.count / result.total) * 100)}%` : '0%' }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">{column.count}</span>
              </button>

              {column.cards.length > 0 ? (
                <ul className="mt-1.5 ml-[8.5rem] space-y-1">
                  {column.cards.map((card) => (
                    <li key={card.rowId}>
                      <button
                        type="button"
                        disabled={!block.onTapScreenId}
                        onClick={() => block.onTapScreenId && onOpenRow(block.onTapScreenId, card.rowId)}
                        className="w-full truncate text-left text-xs text-ink-soft transition-colors hover:text-ink disabled:cursor-default"
                      >
                        {card.title}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const NOTE_STYLES: Record<string, string> = {
  plain: 'border-sand-200 bg-sand-100/60 text-ink-soft',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
}

function NoteBlock({ block }: { block: Extract<Block, { type: 'note' }> }) {
  return (
    <div className={`h-full rounded-2xl border p-4 @min-[560px]:p-5 ${NOTE_STYLES[block.style] ?? NOTE_STYLES.plain}`}>
      {block.title ? (
        <h2 className="mb-1 font-display text-[15px] font-bold tracking-tight">{block.title}</h2>
      ) : null}
      <p className="text-sm leading-relaxed whitespace-pre-line">{block.text}</p>
    </div>
  )
}

function ActionsBlock({
  block,
  onOpenScreen,
}: {
  block: Extract<Block, { type: 'actions' }>
  onOpenScreen: (screenId: string) => void
}) {
  if (block.items.length === 0) return null

  return (
    <section className={`${CARD} p-4 @min-[560px]:p-5`}>
      {block.title ? (
        <h2 className="mb-3 font-display text-[15px] font-bold tracking-tight">{block.title}</h2>
      ) : null}
      <div className="grid grid-cols-2 gap-2.5 @min-[560px]:grid-cols-4">
        {block.items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.screenId) onOpenScreen(item.screenId)
              else if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer')
            }}
            className="flex flex-col items-center gap-2 rounded-xl border border-sand-200 px-2 py-4 text-center transition-all hover:-translate-y-0.5 hover:border-sand-300 hover:shadow-soft"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-sand-100 text-ink">
              <Icon name={item.icon} className="size-5" />
            </span>
            <span className="text-xs font-medium leading-snug">{item.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/**
 * Блок, который нельзя показать.
 *
 * Владелец видит причину и может её исправить. Клиенту причина ни о чём
 * не говорит и к тому же рассказывает про устройство приложения, поэтому
 * ему блок просто не показывается.
 */
function BrokenBlock({
  block,
  result,
  editing,
}: {
  block: Block
  result: Extract<BlockResult, { kind: 'broken' }>
  editing: boolean
}) {
  if (!editing) return null

  return (
    <div className="h-full rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 p-4 text-amber-900">
      <p className="text-sm font-medium">{block.title || 'Блок нужно настроить'}</p>
      <ul className="mt-1.5 space-y-0.5 text-xs leading-relaxed">
        {result.problems
          .filter((problem) => problem.level === 'error')
          .map((problem, index) => (
            <li key={index}>{problem.text}</li>
          ))}
      </ul>
    </div>
  )
}

export function DashboardView({ screen, runtime, editing = false, onOpenScreen, onOpenRow }: Props) {
  const blocks = [...screen.blocks].sort(byPosition)

  if (blocks.length === 0) {
    return (
      <div className="rounded-2xl border border-sand-200 bg-white shadow-soft">
        <EmptyState
          icon="grid"
          title="Сводка пока пустая"
          hint={
            editing
              ? 'Нажмите «Добавить блок» справа: несколько чисел сверху и список последних записей — этого обычно достаточно.'
              : 'Здесь появятся числа и последние записи, когда владелец настроит сводку.'
          }
        />
      </div>
    )
  }

  return (
    <div className="@container">
      <div className="grid grid-cols-12 gap-3 @min-[560px]:gap-4">
        {blocks.map((block) => {
          const result = runtime.blocks[block.id]
          const broken = result?.kind === 'broken'
          // Сломанный блок у клиента не занимает места в сетке вовсе.
          if (broken && !editing) return null

          return (
            <div key={block.id} className={spanClass(block.span)}>
              {broken ? (
                <BrokenBlock block={block} result={result} editing={editing} />
              ) : block.type === 'metric' && result?.kind === 'metric' ? (
                <MetricBlock block={block} result={result} />
              ) : block.type === 'list' && result?.kind === 'list' ? (
                <ListBlock
                  block={block}
                  result={result}
                  moreLabel={
                    runtime.app.screens.find((item) => item.id === block.moreScreenId)?.name ?? 'Все'
                  }
                  onOpenScreen={onOpenScreen}
                  onOpenRow={onOpenRow}
                />
              ) : block.type === 'pipeline' && result?.kind === 'pipeline' ? (
                <PipelineBlock
                  block={block}
                  result={result}
                  onOpenScreen={onOpenScreen}
                  onOpenRow={onOpenRow}
                />
              ) : block.type === 'actions' ? (
                <ActionsBlock block={block} onOpenScreen={onOpenScreen} />
              ) : block.type === 'note' ? (
                <NoteBlock block={block} />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
