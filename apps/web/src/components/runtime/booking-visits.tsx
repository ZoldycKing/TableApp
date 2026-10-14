'use client'

import { dateInstant, type BookingConfig, type Field, type ScreenOf } from '@tableapp/schema'
import type { TableRow } from '@/lib/table-store'
import type { RelatedTitles } from '@/lib/queries'
import { bookingVisitSection, type BookingSection } from '@/lib/booking-lifecycle'
import { CollectionView } from './collection-view'
import type { ListState } from './nav-history'
import { accentTones, EmptyState } from './ui'
import type { CollectionPage } from '@/lib/runtime-page-types'
import type { RuntimePageControls } from '@/lib/use-screen-runtime'

export function BookingVisits({ screen, rows, fields, relatedTitles, config, timeZone, now, state, onState, onOpenRow, onChooseService, accent, page, pageControls }: {
  screen: ScreenOf<'list'> | ScreenOf<'tiles'>
  rows: TableRow[]
  fields: Field[]
  relatedTitles: RelatedTitles
  config: BookingConfig
  timeZone: string
  now: number
  state: ListState
  onState: (state: ListState) => void
  onOpenRow: ((id: string) => void) | null
  onChooseService: (() => void) | null
  accent: string
  page?: CollectionPage
  pageControls?: RuntimePageControls
}) {
  const section = state.bookingSection ?? 'upcoming'
  const groups = { upcoming: [] as TableRow[], history: [] as TableRow[] }
  for (const row of rows) groups[bookingVisitSection(config, row, timeZone, now)].push(row)
  const start = (row: TableRow) => dateInstant(row.data[config.visit.start], timeZone) ?? 0
  groups.upcoming.sort((a, b) => start(a) - start(b))
  groups.history.sort((a, b) => start(b) - start(a))
  const selected = page ? rows : groups[section]
  const pendingOutcome = section === 'history' && selected.some(row => [config.statuses.booked, config.statuses.arrived].includes(String(row.data[config.visit.status])))
  const displayFields = section === 'history' ? fields.map(field => field.id === config.visit.status && field.type === 'single_select'
    ? { ...field, options: { ...field.options, choices: field.options.choices.map(choice => [config.statuses.booked, config.statuses.arrived].includes(choice.id)
      ? { ...choice, name: 'Результат не отмечен', color: 'gray' as const } : choice) } } : field) : fields
  const tones = accentTones(accent)
  const labels: Record<BookingSection, string> = { upcoming: 'Предстоящие', history: 'История' }
  const empty = <div className="rounded-2xl border border-sand-200 bg-white shadow-soft"><EmptyState icon="calendar" title={section === 'upcoming' ? 'Предстоящих записей нет' : 'История пока пуста'}
    hint={section === 'upcoming' ? 'Выберите услугу и свободное время — новая запись появится здесь.' : 'Здесь сохраняются завершённые, отменённые и прошедшие посещения.'}
    action={section === 'upcoming' && onChooseService ? <button type="button" onClick={onChooseService} className={`rounded-xl px-4 py-2.5 text-sm font-medium text-white ${tones.solid}`}>Выбрать услугу</button> : undefined} /></div>
  return <div className="space-y-4">
    <div className="flex rounded-xl border border-sand-200 bg-white p-1" aria-label="Разделы записей">
      {(['upcoming', 'history'] as const).map(value => <button key={value} type="button" aria-pressed={section === value}
        onClick={() => onState({ ...state, bookingSection: value, choiceId: null, query: '' })}
        className={`min-w-0 flex-1 rounded-lg px-2 py-2.5 text-sm transition-colors ${section === value ? `${tones.soft} ${tones.text} font-semibold` : 'text-ink-muted hover:bg-sand-50'}`}>
        {labels[value]} <span className="ml-1 text-xs tabular-nums">{page ? page.sectionCounts[value] ?? 0 : groups[value].length}</span>
      </button>)}
    </div>
    {pendingOutcome && <p className="text-xs leading-relaxed text-ink-muted">Результат части посещений ещё не отмечен. Мастер или администратор обновит статус после оказания услуги.</p>}
    {selected.length === 0 && !page ? empty : <CollectionView screen={screen} rows={selected} fields={displayFields} relatedTitles={relatedTitles}
      state={{ ...state, choiceId: null }} onState={onState} onOpenRow={onOpenRow} exportHref={null} showStatusFilters={false} page={page} pageControls={pageControls} emptyState={empty} />}
  </div>
}
