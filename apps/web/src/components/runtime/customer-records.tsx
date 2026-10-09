'use client'

import { dateInstant, type CustomerWorkflow, type Field, type ScreenOf } from '@tableapp/schema'
import type { TableRow } from '@/lib/table-store'
import type { RelatedTitles } from '@/lib/queries'
import type { ListState } from './nav-history'
import { CollectionView } from './collection-view'
import { EmptyState, accentTones } from './ui'

export function CustomerRecords({ config, screen, rows, fields, relatedTitles, state, onState, onOpenRow, onCatalog, accent }: {
  config: CustomerWorkflow; screen: ScreenOf<'list'> | ScreenOf<'tiles'>; rows: TableRow[]; fields: Field[]; relatedTitles: RelatedTitles
  state: ListState; onState: (state: ListState) => void; onOpenRow: ((id: string) => void) | null; onCatalog: (() => void) | null; accent: string
}) {
  const section = state.customerSection ?? 'active'
  const history = (row: TableRow) => config.terminalStatuses.includes(String(row.data[config.statusFieldId]))
  const active = rows.filter(row => !history(row)), past = rows.filter(history)
  const selected = (section === 'active' ? active : past).sort((a, b) => (dateInstant(b.data[config.createdFieldId ?? '']) ?? 0) - (dateInstant(a.data[config.createdFieldId ?? '']) ?? 0))
  const tones = accentTones(accent)
  return <div className="space-y-4">
    <div className="flex gap-1 rounded-xl bg-sand-100 p-1" aria-label="Разделы личного кабинета">
      {([['active', 'Активные', active.length], ['history', 'История', past.length]] as const).map(([key, label, count]) => <button type="button" key={key} aria-pressed={section === key}
        onClick={() => onState({ ...state, choiceId: null, customerSection: key })} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${section === key ? 'bg-white text-ink shadow-soft' : 'text-ink-muted hover:text-ink'}`}>{label} <span className="ml-1 text-xs text-ink-muted">{count}</span></button>)}
    </div>
    {selected.length ? <CollectionView screen={screen} rows={selected} fields={fields} relatedTitles={relatedTitles} state={{ ...state, choiceId: null }} onState={onState} onOpenRow={onOpenRow} exportHref={null} showStatusFilters={false} /> :
      <div className="rounded-2xl border border-sand-200 bg-white"><EmptyState icon="file" title={section === 'history' ? 'История пока пуста' : 'Активных обращений пока нет'} action={section === 'active' && onCatalog ? <button type="button" onClick={onCatalog} className={`rounded-xl px-4 py-2 text-sm font-medium text-white ${tones.solid}`}>Открыть каталог</button> : undefined} /></div>}
  </div>
}
