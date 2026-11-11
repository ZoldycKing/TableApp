'use client'
import type { CSSProperties, ReactNode } from 'react'
import { ProtoIcon } from '../prototype/icons'
import shell from './layout-shell.module.css'

export type ShellMetric = {
  key: string
  value: ReactNode
  caption: string
  /** Small context under the value (warehouse, formula, …). */
  note?: ReactNode
  pill?: ReactNode
  tone?: 'rose' | 'amber' | 'mint'
  wide?: boolean
}

export type ShellTab = {
  id: string
  label: string
  count?: number
}

/** One-grid list screen: header control row + single white panel (summary → filters → table). */
export function ListScreenShell({
  title,
  meta,
  actions,
  metrics,
  tabs,
  activeTab,
  onTabChange,
  search,
  selects,
  children,
  footer,
  hideHeader,
}: {
  title?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  metrics?: readonly ShellMetric[]
  tabs?: readonly ShellTab[]
  activeTab?: string
  onTabChange?: (id: string) => void
  search?: ReactNode
  selects?: ReactNode
  children: ReactNode
  footer?: ReactNode
  hideHeader?: boolean
}) {
  const visibleMetrics = metrics?.filter(metric => {
    if (metric.value == null || metric.value === '' || metric.value === '—') return false
    return true
  }) ?? []
  const metricCount = visibleMetrics.length
  return <div className={shell.shell} data-layout="list">
    {!hideHeader && (title || actions) ? <header className={shell.header}>
      <div className={shell.headerCopy}>
        {title ? <h2 className={shell.headerTitle}>{title}</h2> : null}
        {meta ? <p className={shell.headerMeta}>{meta}</p> : null}
      </div>
      {actions ? <div className={shell.headerActions}>{actions}</div> : null}
    </header> : null}
    <div className={shell.panel}>
      {metricCount ? <div className={shell.summary} data-count={metricCount} style={{ '--shell-metrics': metricCount } as CSSProperties}>
        {visibleMetrics.map(metric => <div key={metric.key} className={shell.metric} data-wide={metric.wide || undefined}>
          <p className={shell.metricValue}>{metric.value}</p>
          <p className={shell.metricCaption}>{metric.caption}</p>
          {metric.note ? <p className={shell.metricNote}>{metric.note}</p> : null}
          {metric.pill ? <span className={shell.metricPill} data-tone={metric.tone}>{metric.pill}</span> : null}
        </div>)}
      </div> : null}
      {(tabs?.length || search || selects) ? <div className={shell.filters}>
        {tabs?.length ? <div className={shell.filterTabs} role="tablist" aria-label="Фильтры списка">
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
        {(search || selects) ? <div className={shell.filterTools}>
          {search ?? <span />}
          {selects ? <div className={shell.filterSelects}>{selects}</div> : null}
        </div> : null}
      </div> : null}
      <div className={shell.body}>{children}</div>
      {footer ? <div className={shell.panelFooter}>{footer}</div> : null}
    </div>
  </div>
}

/** Compact search field for the shared filter bar. */
export function ShellSearchField({
  value,
  onChange,
  placeholder = 'Найти в списке',
  label = 'Поиск',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
}) {
  return <label className={shell.filterSearch}>
    <ProtoIcon name="search" size={16} />
    <input
      type="search"
      aria-label={label}
      placeholder={placeholder}
      maxLength={200}
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  </label>
}

/**
 * Detail page skeleton (product.html / shared cards):
 * back above the card → hero (media | title+chips | actions) → metric tiles → body cols.
 */
export function DetailCardShell({
  media,
  title,
  subtitle,
  badge,
  chips,
  actions,
  metrics,
  children,
  stickyActions,
  layout = 'card',
  back,
}: {
  media?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  chips?: ReactNode
  actions?: ReactNode
  metrics?: readonly ShellMetric[]
  children?: ReactNode
  stickyActions?: ReactNode
  /** `product` = large photo + chips + desktop actions beside the title (inventory item). */
  layout?: 'card' | 'product'
  /** In-content back control («← Товары»), sits above the card on the page grid. */
  back?: { label: string; onClick: () => void }
}) {
  const visibleMetrics = metrics?.filter(metric => {
    if (metric.value == null || metric.value === '' || metric.value === '—') return false
    return true
  }) ?? []
  const metricCount = visibleMetrics.length
  const product = layout === 'product'
  return <div className={shell.detailPage} data-layout={product ? 'product' : 'detail'}>
    {back ? <button type="button" className={shell.detailBack} onClick={back.onClick}>← {back.label}</button> : null}
    <div className={shell.detail} data-layout={product ? 'product' : 'detail'}>
      <header className={shell.detailHead} data-product={product || undefined}>
        <div className={shell.detailIdentity} data-plain={!media || undefined} data-product={product || undefined}>
          {media ?? null}
          <div className={shell.detailCopy}>
            <div className={shell.detailTitleRow}>
              <div className={shell.detailTitleBlock}>
                <h2 className={shell.detailTitle}>{title}</h2>
                {badge}
              </div>
              {actions ? <div className={shell.detailActions} data-desktop-only={product || undefined}>{actions}</div> : null}
            </div>
            {chips ? <div className={shell.detailChips}>{chips}</div> : null}
            {subtitle ? <p className={shell.detailSubtitle}>{subtitle}</p> : null}
          </div>
        </div>
        {!product && actions ? <div className={shell.detailActions}>{actions}</div> : null}
      </header>
      {metricCount ? <div className={shell.detailMetrics} style={{ '--shell-metrics': metricCount } as CSSProperties} data-count={metricCount} data-tiles={product || undefined}>
        {visibleMetrics.map(metric => <div key={metric.key} className={shell.metric} data-tile={product || undefined}>
          <p className={shell.metricCaption}>{metric.caption}</p>
          <p className={shell.metricValue} data-tone={metric.tone}>{metric.value}</p>
          {metric.note ? <p className={shell.metricNote}>{metric.note}</p> : null}
          {metric.pill ? <span className={shell.metricPill}>{metric.pill}</span> : null}
        </div>)}
      </div> : null}
      {children ? <div className={shell.detailBody} data-product={product || undefined}>{children}</div> : null}
      {stickyActions ? <div className={shell.stickyBar} data-open>{stickyActions}</div> : null}
    </div>
  </div>
}

export function DetailSection({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return <section className={shell.detailSection}>
    {title ? <h3 className={shell.detailSectionTitle}>{title}</h3> : null}
    {children}
  </section>
}
