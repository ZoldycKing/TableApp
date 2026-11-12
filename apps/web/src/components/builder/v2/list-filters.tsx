'use client'

import { createPortal } from 'react-dom'
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { ProtoIcon } from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import shell from './layout-shell.module.css'

export type ListFilterOption = { id: string; label: string; count?: number }

export type ListFilterDef = {
  id: string
  label: string
  options: readonly ListFilterOption[]
  /** Value that means “no filter”. Defaults to `all`. */
  allId?: string
}

export type ListSortDef = { id: string; label: string }

export type ListFilterTab = { id: string; label: string; count?: number }

const ALL = 'all'

function activeCount(filters: readonly ListFilterDef[], values: Record<string, string>) {
  let count = 0
  for (const filter of filters) {
    const allId = filter.allId ?? ALL
    const value = values[filter.id] ?? allId
    if (value !== allId) count += 1
  }
  return count
}

function chipLabel(filter: ListFilterDef, value: string) {
  const option = filter.options.find(item => item.id === value)
  return option ? `${filter.label}: ${option.label}` : filter.label
}

/** Shared Glide-style list filters: search + panel + chips + compact sort. */
export function ListFilterToolbar({
  search,
  onSearch,
  filters,
  values,
  onValuesChange,
  sort,
  sortOptions,
  onSortChange,
  tabs,
  activeTab,
  onTabChange,
  countMatches,
  emptyHint,
}: {
  search: string
  onSearch: (value: string) => void
  filters: readonly ListFilterDef[]
  values: Record<string, string>
  onValuesChange: (next: Record<string, string>) => void
  sort?: string
  sortOptions?: readonly ListSortDef[]
  onSortChange?: (id: string) => void
  tabs?: readonly ListFilterTab[]
  activeTab?: string
  onTabChange?: (id: string) => void
  /** Preview how many rows match a draft filter set (search is already applied by parent when useful). */
  countMatches: (draft: Record<string, string>) => number
  emptyHint?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [draft, setDraft] = useState(values)
  const [sortOpen, setSortOpen] = useState(false)
  const titleId = useId()
  const applied = activeCount(filters, values)
  const preview = useMemo(() => countMatches(draft), [countMatches, draft])

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!open) return
    setDraft(values)
  }, [open, values])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const chips = filters.flatMap(filter => {
    const allId = filter.allId ?? ALL
    const value = values[filter.id] ?? allId
    if (value === allId) return []
    return [{ filter, value, label: chipLabel(filter, value) }]
  })

  const clearAll = () => {
    const next: Record<string, string> = {}
    for (const filter of filters) next[filter.id] = filter.allId ?? ALL
    onValuesChange(next)
    setDraft(next)
  }

  const applyDraft = () => {
    onValuesChange(draft)
    setOpen(false)
  }

  const resetDraft = () => {
    const next: Record<string, string> = {}
    for (const filter of filters) next[filter.id] = filter.allId ?? ALL
    setDraft(next)
  }

  const currentSort = sortOptions?.find(item => item.id === sort) ?? sortOptions?.[0]

  const panel = open && mounted ? createPortal(<>
    <button type="button" className={shell.filterScrim} aria-label="Закрыть" onClick={() => setOpen(false)} />
    <aside className={shell.filterPanel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className={shell.filterPanelHead}>
        <h2 id={titleId}>Фильтры</h2>
        <button type="button" className={shell.filterIconButton} aria-label="Закрыть" onClick={() => setOpen(false)}>
          <ProtoIcon name="close" size={18} />
        </button>
      </div>
      <div className={shell.filterPanelBody}>
        {filters.map(filter => {
          const allId = filter.allId ?? ALL
          const value = draft[filter.id] ?? allId
          return <fieldset key={filter.id} className={shell.filterFieldset}>
            <legend>{filter.label}</legend>
            <div className={shell.filterOptions}>
              {filter.options.map(option => <label key={option.id} className={shell.filterOption} data-active={value === option.id || undefined}>
                <input
                  type="radio"
                  name={`filter-${filter.id}`}
                  checked={value === option.id}
                  onChange={() => setDraft(current => ({ ...current, [filter.id]: option.id }))}
                />
                <span>{option.label}</span>
                {typeof option.count === 'number' ? <strong>{option.count}</strong> : null}
              </label>)}
            </div>
          </fieldset>
        })}
      </div>
      <div className={shell.filterPanelFoot}>
        <button type="button" className={styles.secondary} onClick={resetDraft}>Сбросить</button>
        <button type="button" className={styles.primary} onClick={applyDraft}>Показать {preview.toLocaleString('ru-RU')}</button>
      </div>
    </aside>
  </>, document.body) : null

  return <div className={shell.filterBar}>
    {tabs?.length ? <div className={shell.filterTabs} data-desktop-tabs role="tablist" aria-label="Быстрые фильтры">
      {tabs.map(tab => <button
        key={tab.id}
        type="button"
        role="tab"
        className={shell.filterTab}
        data-active={activeTab === tab.id || undefined}
        aria-selected={activeTab === tab.id}
        onClick={() => onTabChange?.(tab.id)}
      >
        <span>{tab.label}</span>
        {typeof tab.count === 'number' ? <strong>{tab.count}</strong> : null}
      </button>)}
    </div> : null}

    <div className={shell.filterToolsRow}>
      <label className={shell.filterSearch}>
        <ProtoIcon name="search" size={16} />
        <input
          type="search"
          aria-label="Поиск"
          placeholder="Поиск"
          maxLength={200}
          value={search}
          onChange={event => onSearch(event.target.value)}
        />
      </label>
      {filters.length ? <button
        type="button"
        className={shell.filterTrigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <ProtoIcon name="filter" size={16} />
        <span>Фильтры</span>
        {applied > 0 ? <strong className={shell.filterBadge}>{applied}</strong> : null}
      </button> : null}
      {sortOptions?.length && onSortChange ? <div className={shell.filterSortWrap}>
        <button
          type="button"
          className={shell.filterSortButton}
          aria-label={`Сортировка: ${currentSort?.label ?? ''}`}
          aria-haspopup="listbox"
          aria-expanded={sortOpen}
          onClick={() => setSortOpen(value => !value)}
        >
          <ProtoIcon name="sort" size={16} />
          <span className={shell.filterSortLabel}>{currentSort?.label ?? 'Сортировка'}</span>
        </button>
        {sortOpen ? <div className={shell.filterSortMenu} role="listbox" aria-label="Сортировка">
          {sortOptions.map(option => <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={option.id === sort}
            data-active={option.id === sort || undefined}
            onClick={() => { onSortChange(option.id); setSortOpen(false) }}
          >{option.label}</button>)}
        </div> : null}
      </div> : null}
    </div>

    {chips.length ? <div className={shell.filterChips} aria-label="Активные фильтры">
      {chips.map(chip => <button
        key={`${chip.filter.id}:${chip.value}`}
        type="button"
        className={shell.filterChip}
        onClick={() => onValuesChange({ ...values, [chip.filter.id]: chip.filter.allId ?? ALL })}
      >
        <span>{chip.label}</span>
        <ProtoIcon name="close" size={12} />
      </button>)}
      <button type="button" className={shell.filterClearAll} onClick={clearAll}>Сбросить всё</button>
    </div> : null}

    {emptyHint}

    {panel}
  </div>
}
