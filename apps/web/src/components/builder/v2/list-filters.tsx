'use client'

import { createPortal } from 'react-dom'
import { useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ProtoIcon } from '../prototype/icons'
import { BuilderThemeContext } from '../prototype/theme-context'
import styles from '../prototype/prototype.module.css'
import shell from './layout-shell.module.css'

export type ListFilterOption = { id: string; label: string; count?: number }
export type ListFilterValues = Record<string, string | string[]>

export type ListFilterDef = {
  id: string
  label: string
  options: readonly ListFilterOption[]
  /** Value that means “no filter”. Defaults to `all`. */
  allId?: string
  /** Visual control: radio (default), checkbox, or plain selectable row (nav). */
  appearance?: 'radio' | 'checkbox' | 'nav'
  multiple?: boolean
  range?: { minId: string; maxId: string; unit: string }
}

export type ListSortDef = { id: string; label: string }

export type ListFilterTab = { id: string; label: string; count?: number }

const ALL = 'all'

export function listFilterActiveCount(filters: readonly ListFilterDef[], values: ListFilterValues) {
  return listFilterChips(filters, values).length
}

export function listFilterChips(filters: readonly ListFilterDef[], values: ListFilterValues) {
  return filters.flatMap(filter => {
    if (filter.range) {
      const min = values[filter.range.minId], max = values[filter.range.maxId]
      if (!min && !max) return []
      const amount = [min ? `от ${min}` : '', max ? `до ${max}` : ''].filter(Boolean).join(' ')
      return [{ filter, value: 'range', label: `${filter.label}: ${amount} ${filter.range.unit}` }]
    }
    const allId = filter.allId ?? ALL
    const value = values[filter.id] ?? allId
    const selected = Array.isArray(value) ? value : value === allId ? [] : [value]
    return selected.map(value => {
      const option = filter.options.find(item => item.id === value)
      return { filter, value, label: option ? `${filter.label}: ${option.label}` : `${filter.label}: ${value}` }
    })
  })
}

export function listFilterClearAll<V extends ListFilterValues>(filters: readonly ListFilterDef[], values: V): V {
  return filters.reduce((next, filter) => filter.range
    ? { ...next, [filter.range.minId]: '', [filter.range.maxId]: '' }
    : { ...next, [filter.id]: filter.multiple ? [] : filter.allId ?? ALL }, values)
}

function selectOption<V extends ListFilterValues>(values: V, filter: ListFilterDef, id: string): V {
  const value = values[filter.id]
  const selected = Array.isArray(value) ? value : []
  return { ...values, [filter.id]: filter.multiple ? selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id] : id }
}

function rangeError(filter: ListFilterDef, values: ListFilterValues): string {
  if (!filter.range) return ''
  const min = values[filter.range.minId], max = values[filter.range.maxId]
  if ([min, max].some(value => value && (Array.isArray(value) || !Number.isFinite(Number(value)) || Number(value) < 0))) return 'Укажите цену от 0.'
  return min && max && Number(min) > Number(max) ? 'Цена «До» должна быть не меньше цены «От».' : ''
}

function FilterGroup<V extends ListFilterValues>({ filter, values, onChange, prefix }: {
  filter: ListFilterDef; values: V; onChange: (values: V) => void; prefix: string
}) {
  const errorId = useId()
  const error = rangeError(filter, values)
  const range = filter.range
  const value = values[filter.id] ?? filter.allId ?? ALL
  return <fieldset className={shell.filterFieldset}>
    <legend>{filter.label}{range ? `, ${range.unit}` : ''}</legend>
    {range ? <>
      <div className={shell.filterRange}>
        {([['От', range.minId], ['До', range.maxId]] as const).map(([label, id]) => <label key={id}>
          <span>{label}</span>
          <input type="number" min="0" step="any" inputMode="decimal" aria-label={`${filter.label} ${label.toLowerCase()}`} value={values[id] ?? ''}
            aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
            onChange={event => onChange({ ...values, [id]: event.target.value })} />
        </label>)}
      </div>
      {error ? <p id={errorId} className={shell.filterError} role="alert">{error}</p> : null}
    </> : <div className={shell.filterOptions}>
      {filter.options.map(option => <FilterOptionControl key={option.id} name={`${prefix}-${filter.id}`} option={option}
        checked={Array.isArray(value) ? value.includes(option.id) : value === option.id}
        appearance={filter.multiple ? 'checkbox' : 'radio'}
        onSelect={() => onChange(selectOption(values, filter, option.id))} />)}
    </div>}
  </fieldset>
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

export function ListFilterChips<V extends ListFilterValues>({
  filters,
  values,
  onValuesChange,
}: {
  filters: readonly ListFilterDef[]
  values: V
  onValuesChange: (next: V) => void
}) {
  const chips = listFilterChips(filters, values)
  if (!chips.length) return null
  return <div className={shell.filterChips} aria-label="Активные фильтры">
    {chips.map(chip => <button
      key={`${chip.filter.id}:${chip.value}`}
      type="button"
      className={shell.filterChip}
      onClick={() => onValuesChange(chip.filter.range ? listFilterClearAll([chip.filter], values) : chip.filter.multiple ? selectOption(values, chip.filter, chip.value) : { ...values, [chip.filter.id]: chip.filter.allId ?? ALL })}
    >
      <span>{chip.label}</span>
      <ProtoIcon name="close" size={12} />
    </button>)}
    <button type="button" className={shell.filterClearAll} onClick={() => onValuesChange(listFilterClearAll(filters, values))}>
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
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const currentSort = sortOptions.find(item => item.id === sort) ?? sortOptions[0]
  useEffect(() => {
    if (!sortOpen) return
    const onDoc = (event: MouseEvent) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) setSortOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSortOpen(false)
        trigger.current?.focus()
      }
    }
    window.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [sortOpen])
  return <div ref={root} className={shell.filterSortWrap}>
    <button
      ref={trigger}
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
export function CatalogFilterSidebar<V extends ListFilterValues>({
  search,
  onSearch,
  filters,
  values,
  onValuesChange,
}: {
  search: string
  onSearch: (value: string) => void
  filters: readonly ListFilterDef[]
  values: V
  onValuesChange: (next: V) => void
}) {
  const prefix = useId()
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
      {filters.map(filter => <FilterGroup key={filter.id} filter={filter} values={values} onChange={onValuesChange} prefix={prefix} />)}
      <button
        type="button"
        className={`${styles.secondary} ${shell.catalogSidebarReset}`}
        onClick={() => {
          onSearch('')
          onValuesChange(listFilterClearAll(filters, values))
        }}
      >Сбросить</button>
    </div>
  </aside>
}

/** Shared Glide-style list filters: search + panel + chips + compact sort. */
export function ListFilterToolbar<V extends ListFilterValues>({
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
  values: V
  onValuesChange: (next: V) => void
  sort?: string
  sortOptions?: readonly ListSortDef[]
  onSortChange?: (id: string) => void
  tabs?: readonly ListFilterTab[]
  activeTab?: string
  onTabChange?: (id: string) => void
  /** Preview how many rows match a draft filter set (search is already applied by parent when useful). */
  countMatches: (draft: V) => number
  emptyHint?: ReactNode
  /** Hide on desktop (≥1024) — used by catalog which has a sidebar there. */
  mobileOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [draft, setDraft] = useState(values)
  const dialog = useRef<HTMLDialogElement>(null)
  const theme = useContext(BuilderThemeContext)
  const titleId = useId()
  const applied = listFilterActiveCount(filters, values)
  const preview = useMemo(() => countMatches(draft), [countMatches, draft])
  const invalid = filters.some(filter => rangeError(filter, draft))

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!open) return
    setDraft(values)
  }, [open, values])
  useEffect(() => {
    if (!open || !mounted || !dialog.current) return
    const node = dialog.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    node.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      node.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [open, mounted])

  const applyDraft = () => {
    if (invalid) return
    onValuesChange(draft)
    setOpen(false)
  }

  const resetDraft = () => {
    setDraft(listFilterClearAll(filters, draft))
  }

  const panel = open && mounted ? createPortal(
    <dialog ref={dialog} className={`${shell.filterPanel} ${theme?.className ?? ''}`} data-scheme={theme?.scheme} style={theme?.style} aria-modal="true" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); setOpen(false) }}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className={shell.filterPanelHead}>
        <h2 id={titleId}>Фильтры</h2>
        <button type="button" className={shell.filterIconButton} aria-label="Закрыть" onClick={() => setOpen(false)}>
          <ProtoIcon name="close" size={18} />
        </button>
      </div>
      <div className={shell.filterPanelBody}>
        {filters.map(filter => <FilterGroup key={filter.id} filter={filter} values={draft} onChange={setDraft} prefix={titleId} />)}
      </div>
      <div className={shell.filterPanelFoot}>
        <button type="button" className={styles.secondary} onClick={resetDraft}>Сбросить</button>
        <button type="button" className={styles.primary} disabled={invalid} onClick={applyDraft}>Показать {preview.toLocaleString('ru-RU')}</button>
      </div>
    </dialog>, document.body) : null

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
