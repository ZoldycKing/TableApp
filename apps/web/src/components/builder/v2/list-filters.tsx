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
  /** Visual control: radio (default), checkbox, or plain selectable row (nav). */
  appearance?: 'radio' | 'checkbox' | 'nav'
}

export type ListSortDef = { id: string; label: string }

export type ListFilterTab = { id: string; label: string; count?: number }

const ALL = 'all'

export function listFilterActiveCount(filters: readonly ListFilterDef[], values: Record<string, string>) {
  let count = 0
  for (const filter of filters) {
    const allId = filter.allId ?? ALL
    const value = values[filter.id] ?? allId
    if (value !== allId) count += 1
  }
  return count
}

export function listFilterChips(filters: readonly ListFilterDef[], values: Record<string, string>) {
  return filters.flatMap(filter => {
    const allId = filter.allId ?? ALL
    const value = values[filter.id] ?? allId
    if (value === allId) return []
    const option = filter.options.find(item => item.id === value)
    return [{ filter, value, label: option ? `${filter.label}: ${option.label}` : filter.label }]
  })
}

export function listFilterClearAll(filters: readonly ListFilterDef[]): Record<string, string> {
  const next: Record<string, string> = {}
  for (const filter of filters) next[filter.id] = filter.allId ?? ALL
  return next
}

/** Theme-styled radio / checkbox / nav row for filter options. */
export function FilterOptionControl({
  name,
  option,
  checked,
  onSelect,
  appearance = 'radio',
}: {
  name: string
  option: ListFilterOption
  checked: boolean
  onSelect: () => void
  appearance?: 'radio' | 'checkbox' | 'nav'
}) {
  if (appearance === 'nav') {
    return <button
      type="button"
      className={shell.filterNavItem}
      data-active={checked || undefined}
      aria-current={checked ? 'true' : undefined}
      onClick={onSelect}
    >
      <span>{option.label}</span>
      {typeof option.count === 'number' ? <strong>{option.count}</strong> : null}
    </button>
  }
  return <label className={shell.filterOption} data-active={checked || undefined} data-appearance={appearance}>
    <input
      type={appearance === 'checkbox' ? 'checkbox' : 'radio'}
      name={appearance === 'radio' ? name : undefined}
      checked={checked}
      onChange={onSelect}
    />
    <span className={shell.filterMark} aria-hidden data-appearance={appearance} data-checked={checked || undefined} />
    <span>{option.label}</span>
    {typeof option.count === 'number' ? <strong>{option.count}</strong> : null}
  </label>
}

export function ListFilterChips({
  filters,
  values,
  onValuesChange,
}: {
  filters: readonly ListFilterDef[]
  values: Record<string, string>
  onValuesChange: (next: Record<string, string>) => void
}) {
  const chips = listFilterChips(filters, values)
  if (!chips.length) return null
  return <div className={shell.filterChips} aria-label="Активные фильтры">
    {chips.map(chip => <button
      key={`${chip.filter.id}:${chip.value}`}
      type="button"
      className={shell.filterChip}
      onClick={() => onValuesChange({ ...values, [chip.filter.id]: chip.filter.allId ?? ALL })}
    >
      <span>{chip.label}</span>
      <ProtoIcon name="close" size={12} />
    </button>)}
    <button type="button" className={shell.filterClearAll} onClick={() => onValuesChange(listFilterClearAll(filters))}>
      Сбросить всё
    </button>
  </div>
}

export function ListSortControl({
  sort,
  sortOptions,
  onSortChange,
}: {
  sort?: string
  sortOptions: readonly ListSortDef[]
  onSortChange: (id: string) => void
}) {
  const [sortOpen, setSortOpen] = useState(false)
  const currentSort = sortOptions.find(item => item.id === sort) ?? sortOptions[0]
  useEffect(() => {
    if (!sortOpen) return
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (target && !(event.currentTarget instanceof Node)) {
        /* close on any outside click via capture on window */
      }
    }
    const onDoc = (event: MouseEvent) => {
      const root = document.querySelector(`.${shell.filterSortWrap}`)
      if (root && event.target instanceof Node && !root.contains(event.target)) setSortOpen(false)
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
    void onPointer
  }, [sortOpen])
  return <div className={shell.filterSortWrap}>
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
  </div>
}

/** Desktop catalog sidebar — instant filters, sticky under the top nav. */
export function CatalogFilterSidebar({
  search,
  onSearch,
  filters,
  values,
  onValuesChange,
}: {
  search: string
  onSearch: (value: string) => void
  filters: readonly ListFilterDef[]
  values: Record<string, string>
  onValuesChange: (next: Record<string, string>) => void
}) {
  const category = filters.find(filter => filter.id === 'category')
  const rest = filters.filter(filter => filter.id !== 'category')
  return <aside className={shell.catalogSidebar} aria-label="Фильтры каталога">
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
    <div className={shell.catalogSidebarBody}>
      {category ? <div className={shell.catalogSidebarSection}>
        <h3>Категории</h3>
        <div className={shell.filterNav} role="list">
          {category.options.map(option => <FilterOptionControl
            key={option.id}
            name="catalog-category"
            option={option}
            checked={(values.category ?? ALL) === option.id}
            appearance="nav"
            onSelect={() => onValuesChange({ ...values, category: option.id })}
          />)}
        </div>
      </div> : null}
      {rest.map(filter => {
        const allId = filter.allId ?? ALL
        const value = values[filter.id] ?? allId
        return <div key={filter.id} className={shell.catalogSidebarSection}>
          <h3>{filter.label}</h3>
          <div className={shell.filterNav} role="list">
            {filter.options.map(option => <FilterOptionControl
              key={option.id}
              name={`sidebar-${filter.id}`}
              option={option}
              checked={value === option.id}
              appearance="nav"
              onSelect={() => onValuesChange({ ...values, [filter.id]: option.id })}
            />)}
          </div>
        </div>
      })}
      <button
        type="button"
        className={`${styles.secondary} ${shell.catalogSidebarReset}`}
        onClick={() => {
          onSearch('')
          onValuesChange(listFilterClearAll(filters))
        }}
      >Сбросить</button>
    </div>
  </aside>
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
  mobileOnly,
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
  /** Hide on desktop (≥1024) — used by catalog which has a sidebar there. */
  mobileOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [draft, setDraft] = useState(values)
  const titleId = useId()
  const applied = listFilterActiveCount(filters, values)
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

  const applyDraft = () => {
    onValuesChange(draft)
    setOpen(false)
  }

  const resetDraft = () => {
    setDraft(listFilterClearAll(filters))
  }

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
          const appearance = filter.appearance === 'checkbox' ? 'radio' : (filter.appearance ?? 'radio')
          return <fieldset key={filter.id} className={shell.filterFieldset}>
            <legend>{filter.label}</legend>
            <div className={shell.filterOptions}>
              {filter.options.map(option => <FilterOptionControl
                key={option.id}
                name={`filter-${filter.id}`}
                option={option}
                checked={value === option.id}
                appearance={appearance === 'nav' ? 'radio' : appearance}
                onSelect={() => setDraft(current => ({ ...current, [filter.id]: option.id }))}
              />)}
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

  return <div className={shell.filterBar} data-mobile-only={mobileOnly || undefined}>
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
      {sortOptions?.length && onSortChange ? <ListSortControl sort={sort} sortOptions={sortOptions} onSortChange={onSortChange} /> : null}
    </div>

    <ListFilterChips filters={filters} values={values} onValuesChange={onValuesChange} />

    {emptyHint}

    {panel}
  </div>
}
