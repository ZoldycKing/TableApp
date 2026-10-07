'use client'

import type { App, Block, BlockProblem, Field, ScreenOf, View } from '@tableapp/schema'
import {
  BLOCK_CATEGORY_NAMES,
  BLOCK_KINDS,
  blockKind,
  byPosition,
  computeMetric,
  newBlock,
  newId,
  positionBetween,
  positionSequence,
  validateBlock,
} from '@tableapp/schema'
import { useMemo, useState } from 'react'
import { applyView } from '@/lib/apply-view'
import type { RuntimeTable } from '@/lib/app-runtime'
import { suggestBlocks, suggestMetrics, type Suggestion } from '@/lib/dashboard-suggest'
import { formatCell } from '@/lib/format'

import { BlockSettings } from './block-settings'
import { PartAccess } from './part-access'

/**
 * Конструктор сводки.
 *
 * Два способа добавить блок, и порядок между ними не случаен. Сверху —
 * предложения с уже посчитанными числами: «Выручка за месяц — 187 400 ₽».
 * Человек выбирает то, что видит, а не заполняет форму со словами «агрегат»
 * и «период». Ниже — пустые блоки по видам, для тех случаев, когда нужного
 * предложения не нашлось.
 *
 * Список блоков показывает, что в каждом сломано: ссылки на удалённую колонку
 * или экран копятся молча, потому что определение приложения живёт отдельно
 * от таблиц.
 */

export function DashboardEditor({
  app,
  screen,
  views,
  runtimeTables,
  onChange,
}: {
  app: App
  screen: ScreenOf<'dashboard'>
  views: View[]
  runtimeTables: Record<string, RuntimeTable>
  onChange: (screen: ScreenOf<'dashboard'>) => void
}) {
  const [blockId, setBlockId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const blocks = useMemo(() => [...screen.blocks].sort(byPosition), [screen.blocks])
  const selected = blocks.find((block) => block.id === blockId) ?? null

  const setBlocks = (next: Block[]) => onChange({ ...screen, blocks: next })

  /** Строки и поля представления: по ним считаются и предложения, и превью. */
  const dataOf = (viewId: string): { rows: { data: Record<string, unknown> }[]; fields: Field[] } => {
    const view = views.find((item) => item.id === viewId)
    const table = view ? runtimeTables[view.tableId] : undefined
    if (!view || !table) return { rows: [], fields: [] }
    return { rows: applyView(table.rows, table.fields, view.config).rows, fields: table.fields }
  }

  /*
   * Проверка настроек каждого блока. Экраны и роли берутся из всего
   * приложения: блок вполне может вести на экран с соседней вкладки.
   */
  const problems = useMemo(() => {
    const context = {
      views: Object.fromEntries(views.map((view) => [view.id, { id: view.id, name: view.name, tableId: view.tableId }])),
      fields: Object.fromEntries(
        Object.entries(runtimeTables).map(([tableId, table]) => [tableId, table.fields]),
      ),
      screenIds: new Set(app.screens.map((item) => item.id)),
      roleIds: new Set(app.roles.map((role) => role.id)),
    }
    const out = new Map<string, BlockProblem[]>()
    for (const block of blocks) out.set(block.id, validateBlock(block, context))
    return out
  }, [blocks, views, runtimeTables, app.screens, app.roles])

  /*
   * Предложения собираются по каждому представлению приложения: одна и та же
   * сводка может показывать и заказы, и позиции, и человек не должен сначала
   * выбирать источник, а потом гадать, что из него можно посчитать.
   */
  const suggestions = useMemo(() => {
    const out: { suggestion: Suggestion; value: string | null; table: string; own: boolean }[] = []

    /*
     * Представления, которые приложение уже показывает, идут первыми: скорее
     * всего человек хочет посчитать именно их. Остальные таблицы пространства
     * тоже доступны — добавить по ним блок он вправе, это его данные.
     */
    const used = new Set<string>()
    for (const item of app.screens) {
      if (item.type === 'list' || item.type === 'tiles') used.add(item.source.viewId)
      if (item.type === 'dashboard') {
        for (const block of item.blocks) if ('source' in block) used.add(block.source.viewId)
      }
    }

    for (const view of views) {
      const table = runtimeTables[view.tableId]
      if (!table) continue

      const ctx = {
        fields: table.fields,
        viewId: view.id,
        tableName: table.name,
        primaryFieldId: table.primaryFieldId,
        listScreenId: app.screens.find((item) => item.type === 'list')?.id ?? null,
        detailScreenId: app.screens.find((item) => item.type === 'detail')?.id ?? null,
        createScreenId:
          app.screens.find((item) => item.type === 'form' && item.mode === 'create')?.id ?? null,
      }

      const { rows, fields } = dataOf(view.id)

      for (const suggestion of [...suggestMetrics(ctx), ...suggestBlocks(ctx)]) {
        let value: string | null = null
        const draft = suggestion.block
        if (draft.type === 'metric') {
          const result = computeMetric(draft, rows)
          const field = fields.find((item) => item.id === draft.fieldId)
          value =
            result.value === null
              ? '—'
              : field && draft.kind !== 'count'
                ? formatCell(field, result.value)
                : new Intl.NumberFormat('ru-RU').format(result.value)
        }
        out.push({ suggestion, value, table: `${table.name} · ${view.name}`, own: used.has(view.id) })
      }
    }

    return out.sort((a, b) => Number(b.own) - Number(a.own))
  }, [app.screens, views, runtimeTables])

  const place = (block: Block) => {
    const last = blocks[blocks.length - 1]?.position ?? null
    const next = { ...block, position: positionBetween(last, null) }
    setBlocks([...blocks, next])
    setBlockId(next.id)
    setAdding(false)
  }

  /** Вставка предложения: идентификатор выдаём новый, чтобы не столкнуть два одинаковых. */
  const add = (draft: Block) => place({ ...draft, id: newId('component') })

  /** Пустой блок выбранного вида — по первому представлению, если оно есть. */
  const addEmpty = (type: Block['type']) =>
    place(
      newBlock(type, {
        id: newId('component'),
        position: 'a',
        viewId: views[0]?.id ?? null,
        screenId: app.screens.find((item) => item.type === 'detail')?.id ?? null,
      }),
    )

  const duplicate = (block: Block) => {
    const copy = { ...block, id: newId('component'), title: block.title ? `${block.title} (копия)` : '' }
    const index = blocks.findIndex((item) => item.id === block.id)
    const next = [...blocks]
    next.splice(index + 1, 0, copy as Block)
    setBlocks(renumber(next))
    setBlockId(copy.id)
  }

  const move = (index: number, step: number) => {
    const target = index + step
    if (target < 0 || target >= blocks.length) return
    const reordered = [...blocks]
    const [item] = reordered.splice(index, 1)
    reordered.splice(target, 0, item!)
    setBlocks(renumber(reordered))
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {blocks.map((block, index) => {
          const found = problems.get(block.id) ?? []
          const broken = found.some((problem) => problem.level === 'error')

          return (
            <div
              key={block.id}
              className={`rounded-lg border px-2 py-1.5 ${
                block.id === blockId
                  ? 'border-sage-200 bg-sage-50'
                  : broken
                    ? 'border-amber-300 bg-amber-50/60'
                    : 'border-[var(--color-border-subtle)]'
              }`}
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setBlockId(block.id === blockId ? null : block.id)}
                  className="flex min-w-0 flex-1 items-baseline gap-2 text-left text-sm"
                >
                  <span className="shrink-0">{blockKind(block.type).label}</span>
                  <span className="truncate text-xs text-[var(--color-ink-muted)]">
                    {block.title || '—'}
                  </span>
                </button>
                <button type="button" title="Выше" onClick={() => move(index, -1)} className="rounded px-1 text-xs hover:bg-black/5">↑</button>
                <button type="button" title="Ниже" onClick={() => move(index, 1)} className="rounded px-1 text-xs hover:bg-black/5">↓</button>
                <button type="button" title="Дублировать" onClick={() => duplicate(block)} className="rounded px-1 text-xs hover:bg-black/5">⧉</button>
                <button
                  type="button"
                  title="Удалить"
                  onClick={() => {
                    setBlocks(blocks.filter((item) => item.id !== block.id))
                    if (blockId === block.id) setBlockId(null)
                  }}
                  className="rounded px-1 text-xs text-red-600 hover:bg-red-50"
                >
                  ×
                </button>
              </div>

              {found.length > 0 ? (
                <ul className="mt-1 space-y-0.5 pl-0.5 text-xs leading-snug">
                  {found.map((problem, at) => (
                    <li key={at} className={problem.level === 'error' ? 'text-amber-800' : 'text-[var(--color-ink-muted)]'}>
                      {problem.level === 'error' ? '! ' : '· '}
                      {problem.text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )
        })}

        {blocks.length === 0 ? (
          <div className="space-y-1.5 rounded-lg border border-dashed border-[var(--color-border-subtle)] p-3">
            <p className="text-sm font-medium">Сводка пустая</p>
            <p className="text-xs leading-relaxed text-[var(--color-ink-muted)]">
              Домашний экран — первое, что человек видит утром. Обычно хватает нескольких чисел
              сверху и списка последних записей.
            </p>
            {suggestions.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  const chosen = suggestions.slice(0, 5).map((item) => item.suggestion.block)
                  const positions = positionSequence(chosen.length)
                  setBlocks(
                    chosen.map((block, at) => ({ ...block, id: newId('component'), position: positions[at]! })),
                  )
                }}
                className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white hover:bg-ink/90"
              >
                Собрать сводку за меня
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setAdding((value) => !value)}
        className="rounded border border-[var(--color-border-subtle)] px-2 py-1 text-xs hover:bg-[var(--color-surface-muted)]"
      >
        {adding ? 'Закрыть' : '+ Добавить блок'}
      </button>

      {adding ? (
        <div className="space-y-2.5 rounded-lg border border-[var(--color-border-subtle)] p-2.5">
          <div className="space-y-1.5">
            <p className="text-xs text-[var(--color-ink-muted)]">
              Числа посчитаны по вашим данным прямо сейчас. Выберите то, на что смотрите каждый день.
            </p>

            {suggestions.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-muted)]">
                Нечего предложить: у приложения нет ни одного представления с данными.
              </p>
            ) : null}

            {suggestions.map(({ suggestion, value, table }, index) => (
              <button
                key={`${suggestion.block.type}-${index}`}
                type="button"
                onClick={() => add(suggestion.block)}
                className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border-subtle)] px-2.5 py-2 text-left transition-colors hover:border-sage-300 hover:bg-sage-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {suggestion.block.title || blockKind(suggestion.block.type).label}
                  </span>
                  <span className="block truncate text-xs text-[var(--color-ink-muted)]">
                    {suggestion.why} · {table}
                  </span>
                </span>
                {value !== null ? (
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>
                ) : (
                  <span className="shrink-0 text-xs text-[var(--color-ink-muted)]">
                    {blockKind(suggestion.block.type).label}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="space-y-2 border-t border-[var(--color-border-subtle)] pt-2">
            <p className="text-xs text-[var(--color-ink-muted)]">Или пустой блок и настроить самому:</p>
            {(['numbers', 'data', 'actions'] as const).map((category) => (
              <div key={category} className="space-y-1">
                <p className="text-xs font-medium text-[var(--color-ink-muted)]">
                  {BLOCK_CATEGORY_NAMES[category]}
                </p>
                {BLOCK_KINDS.filter((kind) => kind.category === category).map((kind) => (
                  <button
                    key={kind.type}
                    type="button"
                    onClick={() => addEmpty(kind.type)}
                    className="block w-full rounded-lg border border-[var(--color-border-subtle)] px-2.5 py-1.5 text-left hover:border-sage-300 hover:bg-sage-50"
                  >
                    <span className="block text-sm font-medium">{kind.label}</span>
                    <span className="block text-xs text-[var(--color-ink-muted)]">{kind.hint}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="space-y-2 border-t border-[var(--color-border-subtle)] pt-3">
          <h3 className="text-xs font-medium text-[var(--color-ink-muted)]">
            {blockKind(selected.type).label}
          </h3>

          <BlockSettings
            block={selected}
            views={views}
            runtimeTables={runtimeTables}
            screens={app.screens}
            onChange={(next) =>
              setBlocks(blocks.map((item) => (item.id === next.id ? next : item)))
            }
          />

          <PartAccess
            app={app}
            screenRoles={screen.access.roles}
            roles={selected.roles}
            hint="Остальным ролям этот блок не придёт, а числа в нём не посчитаются."
            onChange={(roles) =>
              setBlocks(
                blocks.map((item) => (item.id === selected.id ? ({ ...item, roles } as Block) : item)),
              )
            }
          />
        </div>
      ) : null}
    </div>
  )
}

/**
 * Позиции переписываем заново: дробный индекс важен для строк таблицы,
 * а блоков на сводке десяток, и простой пересчёт понятнее.
 */
function renumber(blocks: readonly Block[]): Block[] {
  const positions = positionSequence(blocks.length)
  return blocks.map((block, at) => ({ ...block, position: positions[at]! }) as Block)
}
