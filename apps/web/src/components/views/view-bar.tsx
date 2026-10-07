'use client'

import type { Field, View, ViewType } from '@tableapp/schema'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { VIEW_TYPE_LABELS } from '@/lib/field-labels'
import { countFilters } from '@/lib/apply-view'
import { FilterBuilder } from './filter-builder'
import { FieldVisibilityEditor, GroupEditor, SortEditor } from './view-controls'

const VIEW_TYPES: ViewType[] = ['grid', 'kanban', 'calendar', 'gallery']

const VIEW_ICONS: Record<ViewType, string> = {
  grid: '▦',
  kanban: '▤',
  calendar: '▥',
  gallery: '▣',
}

/** Закрытие по Escape: без него поповер ловит клики подложкой и блокирует интерфейс. */
function useEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])
}

function Popover({
  label,
  badge,
  active,
  children,
}: {
  label: string
  badge?: number
  active?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  useEscape(open, () => setOpen(false))

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`rounded-lg border px-3 py-1.5 text-sm transition-all ${
          active
            ? 'border-sage-300 bg-sage-50 text-sage-700'
            : 'border-sand-300 bg-white hover:border-ink/20 hover:bg-sand-50'
        }`}
      >
        {label}
        {badge ? <span className="ml-1 text-xs">{badge}</span> : null}
      </button>

      {open ? (
        <>
          {/* Подложка закрывает поповер по клику мимо, не перехватывая Escape. */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 w-[min(36rem,calc(100vw-3rem))] rounded-xl border border-[var(--color-border-subtle)] bg-white p-3 shadow-lg">
            {children}
          </div>
        </>
      ) : null}
    </div>
  )
}

type ViewBarProps = {
  views: View[]
  activeView: View
  fields: Field[]
  search: string
  hiddenCount: number
  onSelectView: (viewId: string) => void
  onCreateView: (type: ViewType) => void
  onRenameView: (name: string) => void
  onDeleteView: () => void
  onConfigChange: (config: View['config']) => void
  onSearch: (query: string) => void
}

export function ViewBar({
  views,
  activeView,
  fields,
  search,
  hiddenCount,
  onSelectView,
  onCreateView,
  onRenameView,
  onDeleteView,
  onConfigChange,
  onSearch,
}: ViewBarProps) {
  const [adding, setAdding] = useState(false)
  useEscape(adding, () => setAdding(false))
  const config = activeView.config
  const filterCount = countFilters(config)

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-border-subtle)] pb-2">
        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => onSelectView(view.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all ${
              view.id === activeView.id
                ? 'bg-white font-medium shadow-soft'
                : 'text-ink-muted hover:bg-sand-100 hover:text-ink'
            }`}
          >
            <span aria-hidden>{VIEW_ICONS[view.type]}</span>
            {view.name}
          </button>
        ))}

        <div className="relative">
          <button
            type="button"
            onClick={() => setAdding((value) => !value)}
            className="rounded-lg px-2.5 py-1.5 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            + Представление
          </button>
          {adding ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setAdding(false)} />
              <div className="absolute left-0 top-full z-40 mt-1 w-48 rounded-xl border border-[var(--color-border-subtle)] bg-white p-1 shadow-lg">
                {VIEW_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setAdding(false)
                      onCreateView(type)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--color-surface-muted)]"
                  >
                    <span aria-hidden>{VIEW_ICONS[type]}</span>
                    {VIEW_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={activeView.name}
          onChange={(event) => onRenameView(event.target.value)}
          className="min-w-32 max-w-56 rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium outline-none hover:border-[var(--color-border-subtle)] focus:border-sage-400"
        />

        <Popover label="Фильтр" badge={filterCount} active={filterCount > 0}>
          <FilterBuilder
            fields={fields}
            group={config.filter}
            onChange={(filter) => onConfigChange({ ...config, filter })}
          />
        </Popover>

        <Popover label="Сортировка" badge={config.sorts.length} active={config.sorts.length > 0}>
          <SortEditor
            fields={fields}
            sorts={config.sorts}
            onChange={(sorts) => onConfigChange({ ...config, sorts })}
          />
        </Popover>

        <Popover label="Группировка" badge={config.groupBy.length} active={config.groupBy.length > 0}>
          <GroupEditor
            fields={fields}
            groupBy={config.groupBy}
            onChange={(groupBy) => onConfigChange({ ...config, groupBy })}
          />
        </Popover>

        <Popover
          label="Поля"
          badge={config.hiddenFieldIds.length}
          active={config.hiddenFieldIds.length > 0}
        >
          <FieldVisibilityEditor
            fields={fields}
            hiddenFieldIds={config.hiddenFieldIds}
            onChange={(hiddenFieldIds) => onConfigChange({ ...config, hiddenFieldIds })}
          />
        </Popover>

        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Поиск"
          className="min-w-40 rounded-lg border border-[var(--color-border-subtle)] px-2.5 py-1.5 text-sm outline-none focus:border-sage-400"
        />

        {hiddenCount > 0 ? (
          <span className="text-sm text-[var(--color-ink-muted)]">скрыто строк: {hiddenCount}</span>
        ) : null}

        {views.length > 1 ? (
          <button
            type="button"
            onClick={onDeleteView}
            className="ml-auto rounded-lg px-2.5 py-1.5 text-sm text-[var(--color-ink-muted)] hover:bg-red-50 hover:text-red-600"
          >
            Удалить представление
          </button>
        ) : null}
      </div>
    </div>
  )
}
