'use client'

import { dateInstant, type App, type CustomerWorkflow, type Field, type ScreenOf } from '@tableapp/schema'
import type { TableRow } from '@/lib/table-store'
import type { RelatedTitles } from '@/lib/queries'
import type { ListState } from './nav-history'
import { CollectionView } from './collection-view'
import { EmptyState, accentTones } from './ui'
import type { CollectionPage } from '@/lib/runtime-page-types'
import type { RuntimePageControls } from '@/lib/use-screen-runtime'
import { customerWorkflowNouns } from '@/lib/workflow-screen-names'

export function CustomerRecords({ app, config, screen, rows, fields, relatedTitles, state, onState, onOpenRow, onCatalog, accent, page, pageControls, orderPriceField }: {
  app: App; config: CustomerWorkflow; screen: ScreenOf<'list'> | ScreenOf<'tiles'>; rows: TableRow[]; fields: Field[]; relatedTitles: RelatedTitles
  state: ListState; onState: (state: ListState) => void; onOpenRow: ((id: string) => void) | null; onCatalog: (() => void) | null; accent: string
  page?: CollectionPage; pageControls?: RuntimePageControls
  orderPriceField?: Field
}) {
  const section = state.customerSection ?? 'active'
  const history = (row: TableRow) => config.terminalStatuses.includes(String(row.data[config.statusFieldId]))
  const active = rows.filter(row => !history(row)), past = rows.filter(history)
  const selected = page ? rows : (section === 'active' ? active : past).sort((a, b) => (dateInstant(b.data[config.createdFieldId ?? '']) ?? 0) - (dateInstant(a.data[config.createdFieldId ?? '']) ?? 0))
  const tones = accentTones(accent)
  const empty = <div className="rounded-2xl border border-sand-200 bg-white"><EmptyState icon="file" title={section === 'history' ? 'История пока пуста' : `Активных ${customerWorkflowNouns(app, config).genitivePlural} пока нет`} action={section === 'active' && onCatalog ? <button type="button" onClick={onCatalog} className={`rounded-xl px-4 py-2 text-sm font-medium text-white ${tones.solid}`}>Открыть каталог</button> : undefined} /></div>
  return <div className="space-y-4">
    <div className="flex gap-1 rounded-xl bg-sand-100 p-1" aria-label="Разделы личного кабинета">
      {([['active', 'Активные', page ? page.sectionCounts.active ?? 0 : active.length], ['history', 'История', page ? page.sectionCounts.history ?? 0 : past.length]] as const).map(([key, label, count]) => <button type="button" key={key} aria-pressed={section === key}
        onClick={() => onState({ ...state, choiceId: null, customerSection: key })} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${section === key ? 'bg-white text-ink shadow-soft' : 'text-ink-muted hover:text-ink'}`}>{label} <span className="ml-1 text-xs text-ink-muted">{count}</span></button>)}
    </div>
    {selected.length || page ? <CollectionView screen={screen} rows={selected} fields={fields} relatedTitles={relatedTitles} state={{ ...state, choiceId: null }} onState={onState} onOpenRow={onOpenRow} exportHref={null} showStatusFilters={false} page={page} pageControls={pageControls} emptyState={empty} order={config.cart && config.logistics?.kind === 'sales' ? config : undefined} orderPriceField={orderPriceField} /> : empty}
  </div>
}
