'use client'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import scroll from './scroll-overflow.module.css'
import { useScrollOverflow } from './scroll-overflow'
import type { AppV2, AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import {
  DOC_KIND_FROM_LABEL, DOC_KIND_LABEL, DOC_STATUS_FROM_LABEL, DOC_STATUS_LABEL, SELECTABLE_VAT_RATES,
  amountInWordsRu, computeInvoiceTotals, convertDocument, emptyInvoiceLine, formatInvoiceDate, formatInvoiceMoney,
  lineTotal, nextDocumentNumber, parseInvoiceLines, parsePayments, paymentsTotal, remainingBalance,
  resolveDocStatus, serializeInvoiceLines, serializePayments, summaryTotals, type DocKind, type DocStatus, type InvoiceLine, type PaymentEntry,
} from '@/lib/invoices-logic'
import { builderV2MoneyInputChange, builderV2ParseMoneyInput } from '@/lib/builder-v2-money'
import { buildInvoicePdf, type InvoicePdfImage } from '@/lib/invoices-pdf'
import { useBuilderV2NodeData } from './use-data'
import { DateMenu } from './booking-calendar'
import { AppDialog } from './app-dialog'
import { DetailCardShell, DetailSection, ListScreenShell, ShellSearchField } from './layout-shell'
import { ProtoIcon } from '../prototype/icons'
import buttons from '../prototype/prototype.module.css'
import type { AppV2RendererProps } from './view'
import css from './invoices.module.css'

export type InvoicesBundle = { rows: AppV2Record[]; setRows?: (rows: AppV2Record[]) => void; open?: 'payment' | 'create' | 'pdf' | 'edit' | null }
export const InvoicesRowsContext = createContext<InvoicesBundle | null>(null)

const PLACEHOLDER = { id: 'inv_ph', name: 'ph', type: 'heading' as const, value: { kind: 'literal' as const, value: '' }, size: 's' as const, visibleTo: null, visibleWhen: null }
const STATUSES: DocStatus[] = ['draft', 'sent', 'partial', 'paid', 'overdue']

const textOf = (value: unknown) => Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : '').filter(Boolean).join(', ') : value == null ? '' : String(value)
const numOf = (value: unknown) => {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}
const choiceName = (tables: readonly BuilderV2Table[], tableId: string, fieldId: string, value: unknown) => {
  const field = tables.find(table => table.id === tableId)?.fields.find(item => item.id === fieldId)
  return typeof value === 'string' ? field?.choices?.find(choice => choice.id === value)?.name ?? '' : ''
}
const relatedName = (rows: readonly AppV2Record[], tables: readonly BuilderV2Table[], value: unknown) => {
  const ids = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : typeof value === 'string' ? [value] : []
  return ids.map(id => {
    const row = rows.find(item => item.id === id)
    const primary = tables.find(table => table.id === row?.tableId)?.primaryFieldId
    return row && primary ? textOf(row.values[primary]) : ''
  }).filter(Boolean).join(', ')
}
const todayYmd = () => new Date().toISOString().slice(0, 10)
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
/** Storage may keep full ISO instants from relative demo dates — DateMenu needs YYYY-MM-DD. */
const toYmd = (value: unknown) => {
  const text = textOf(value).trim()
  if (!text) return ''
  const ymd = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (ymd) return ymd[1]!
  const display = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (display) return `${display[3]}-${display[2]}-${display[1]}`
  return ''
}

function collectionOn(app: AppV2, screenId: string, tableId: string) {
  const screen = app.screens.find(item => item.id === screenId)
  for (const id of screen?.rootIds ?? []) {
    const node = app.nodes.find(item => item.id === id)
    if (node?.type !== 'collection') continue
    const source = app.sources.find(item => item.id === node.sourceId)
    if (source?.tableId === tableId) return node
  }
  return null
}

function ChoiceRow({ label, value, options, onChange }: { label: string; value: string; options: { id: string; name: string }[]; onChange: (id: string) => void }) {
  return <fieldset className={css.field}><legend>{label}</legend><div className={css.choiceRow} role="radiogroup" aria-label={label}>{options.map(option => <button key={option.id || option.name} type="button" aria-pressed={option.id === value} onClick={() => onChange(option.id)}>{option.name}</button>)}</div></fieldset>
}

function Badge({ name }: { name: string }) {
  if (!name) return null
  const tone = name === 'Просрочен' ? 'red' : name === 'Оплачен' ? 'green' : name === 'Частично оплачен' ? 'amber' : undefined
  return <span className={css.badge} data-tone={tone}>{name}</span>
}

function SearchPick({
  label, value, options, onChange, placeholder, searchLabel, footer,
}: {
  label: string
  value: string
  options: { id: string; name: string }[]
  onChange: (id: string) => void
  placeholder: string
  searchLabel: string
  footer?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const selected = options.find(option => option.id === value)
  const shown = options.filter(option => option.name.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')))
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className={css.field} ref={root}><span>{label}</span><div className={css.picker}>
    <button type="button" className={css.pickerButton} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(current => !current)}>
      <span>{selected?.name || placeholder}</span><ProtoIcon name="down" size={16} />
    </button>
    {open ? <div className={css.pickerPanel}>
      <input type="text" aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={event => setQuery(event.target.value)} />
      <ul role="listbox">
        {shown.map(option => <li key={option.id}><button type="button" role="option" aria-selected={option.id === value} onClick={() => { onChange(option.id); setOpen(false); setQuery('') }}>{option.name}</button></li>)}
        {shown.length ? null : <li className={css.empty}>Ничего не найдено</li>}
      </ul>
      {footer ? <div className={css.pickerExtra}>{footer}</div> : null}
    </div> : null}
  </div></div>
}

function formatMoneyTyping(value: number) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number.isFinite(value) ? value : 0)
    .replace(/\u00A0|\u202F/g, ' ')
}

function MoneyField({ label, value, onChange, ariaLabel }: { label?: string; value: number; onChange: (value: number) => void; ariaLabel?: string }) {
  const [text, setText] = useState(() => formatMoneyTyping(value))
  const input = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  useEffect(() => {
    if (document.activeElement === input.current) return
    setText(formatMoneyTyping(value))
  }, [value])
  useEffect(() => {
    if (caret.current == null || !input.current) return
    input.current.setSelectionRange(caret.current, caret.current)
    caret.current = null
  }, [text])
  return <div className={css.moneyField}>
    {label ? <span>{label}</span> : null}
    <div className={css.moneyInputWrap}>
      <input
        ref={input}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel ?? label}
        value={text}
        onChange={event => {
          const next = builderV2MoneyInputChange(event.target.value, event.target.selectionStart ?? event.target.value.length)
          if (!next) return
          caret.current = next.caret
          setText(next.text)
          const parsed = builderV2ParseMoneyInput(next.text)
          if (parsed != null && Number.isFinite(parsed)) onChange(parsed)
        }}
        onBlur={() => {
          const parsed = builderV2ParseMoneyInput(text)
          const amount = parsed != null && Number.isFinite(parsed) ? parsed : 0
          onChange(amount)
          setText(formatMoneyTyping(amount))
        }}
      />
      <span className={css.moneySuffix}>₽</span>
    </div>
  </div>
}

export function InvoicesScreen(props: AppV2RendererProps) {
  const kit = props.app.invoices
  const demo = useContext(InvoicesRowsContext)
  const screenId = props.screenId
  const recordId = props.record?.id
  const live = Boolean(props.live) && !demo
  const scope = { screenId, ...(recordId ? { recordId } : {}) }
  const docsNode = kit ? collectionOn(props.app, screenId, kit.documentsTableId) : null
  const clientsNode = kit ? collectionOn(props.app, screenId, kit.clientsTableId) : null
  const productsNode = kit ? collectionOn(props.app, screenId, kit.productsTableId) : null
  const settingsNode = kit ? collectionOn(props.app, screenId, kit.settingsTableId) : null
  const docsPage = useBuilderV2NodeData(props.app, docsNode ?? PLACEHOLDER, live && Boolean(docsNode), '', scope)
  const clientsPage = useBuilderV2NodeData(props.app, clientsNode ?? PLACEHOLDER, live && Boolean(clientsNode), '', scope)
  const productsPage = useBuilderV2NodeData(props.app, productsNode ?? PLACEHOLDER, live && Boolean(productsNode), '', scope)
  const settingsPage = useBuilderV2NodeData(props.app, settingsNode ?? PLACEHOLDER, live && Boolean(settingsNode), '', scope)
  const screens = kit ? [kit.homeScreenId, kit.documentScreenId, kit.clientsScreenId, kit.productsScreenId, kit.settingsScreenId] : []
  if (!kit || !props.app.screens.some(screen => screen.id === screenId && screens.includes(screen.id))) return null
  const allRows = demo?.rows ?? [...(docsPage.page?.rows ?? []), ...(clientsPage.page?.rows ?? []), ...(productsPage.page?.rows ?? []), ...(settingsPage.page?.rows ?? [])]
  const shared: ScreenProps = { ...props, kit, allRows, of: (tableId: string) => allRows.filter(row => row.tableId === tableId), replace: demo?.setRows }
  if (screenId === kit.homeScreenId) return <HomeList {...shared} />
  if (screenId === kit.documentScreenId && recordId) return <DocumentCard {...shared} recordId={recordId} />
  if (screenId === kit.clientsScreenId) return <ClientsList {...shared} />
  if (screenId === kit.productsScreenId) return <ProductsList {...shared} />
  if (screenId === kit.settingsScreenId) return <SettingsCard {...shared} />
  return null
}

type ScreenProps = AppV2RendererProps & {
  kit: NonNullable<AppV2['invoices']>
  allRows: AppV2Record[]
  of: (tableId: string) => AppV2Record[]
  replace?: (rows: AppV2Record[]) => void
}

type ListFilters = { clientId: string; period: string }

function docKind(row: AppV2Record, kit: ScreenProps['kit'], tables: readonly BuilderV2Table[]) {
  const label = choiceName(tables, kit.documentsTableId, kit.document.kind, row.values[kit.document.kind])
  return DOC_KIND_FROM_LABEL[label] ?? 'estimate'
}
function docStatus(row: AppV2Record, kit: ScreenProps['kit'], tables: readonly BuilderV2Table[]) {
  const label = choiceName(tables, kit.documentsTableId, kit.document.status, row.values[kit.document.status])
  return DOC_STATUS_FROM_LABEL[label] ?? 'draft'
}

function patchRow(props: ScreenProps, row: AppV2Record, values: Record<string, AppV2Json>) {
  const next = props.allRows.map(item => item.id === row.id ? { ...item, values: { ...item.values, ...values } } : item)
  props.replace?.(next)
}

function relationIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : typeof value === 'string' ? [value] : []
}

function mediaFiles(value: unknown): { url: string; name?: string; mime?: string }[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is { url: string; name?: string; mime?: string } => Boolean(item && typeof item === 'object' && typeof (item as { url?: unknown }).url === 'string'))
}

function HomeList(props: ScreenProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [filters, setFilters] = useState<ListFilters>({ clientId: '', period: '' })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const chipsRef = useRef<HTMLDivElement>(null)
  useScrollOverflow(chipsRef, [status])
  const docs = props.of(props.kit.documentsTableId)
  const clients = props.of(props.kit.clientsTableId)
  const resolvedOf = (row: AppV2Record) => resolveDocStatus({
    status: docStatus(row, props.kit, props.tables),
    due: toYmd(row.values[props.kit.document.due]),
    total: numOf(row.values[props.kit.document.total]),
    payments: parsePayments(row.values[props.kit.document.payments]),
  })
  const filtered = useMemo(() => docs.filter(row => {
    const number = textOf(row.values[props.kit.document.number])
    const client = relatedName(props.allRows, props.tables, row.values[props.kit.document.client])
    const statusKey = resolvedOf(row)
    if (status && statusKey !== status) return false
    if (filters.clientId && !relationIds(row.values[props.kit.document.client]).includes(filters.clientId)) return false
    const date = toYmd(row.values[props.kit.document.date])
    if (filters.period === 'month' && date < monthStart()) return false
    if (search && !`${number} ${client}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [docs, filters, props, search, status])
  const summary = summaryTotals(docs.map(row => ({
    kind: docKind(row, props.kit, props.tables),
    status: resolvedOf(row),
    total: numOf(row.values[props.kit.document.total]),
    paid: numOf(row.values[props.kit.document.paid]),
  })))
  return <ListScreenShell
    title="Документы"
    search={<ShellSearchField value={search} onChange={setSearch} placeholder="Номер или клиент" />}
    actions={<>
      <button type="button" className={buttons.secondary} onClick={() => setFiltersOpen(true)}>Фильтры</button>
      <button type="button" className={buttons.primary} onClick={() => setCreateOpen(true)}><ProtoIcon name="plus" size={16} />Новый документ</button>
    </>}
  >
    <div className={css.root} data-invoices-home>
      <div className={css.summary}>
        <SummaryCard label="Выставлено" value={formatInvoiceMoney(summary.issued)} />
        <SummaryCard label="Оплачено" value={formatInvoiceMoney(summary.paid)} />
        <SummaryCard label="Долг" value={formatInvoiceMoney(summary.debt)} tone="debt" />
      </div>
      <div className={css.toolbar}>
        <div ref={chipsRef} className={`${css.chips} ${scroll.row}`} role="toolbar" aria-label="Статус">
          <button type="button" className={css.chip} aria-pressed={!status} onClick={() => setStatus('')}>Все</button>
          {STATUSES.map(item => <button key={item} type="button" className={css.chip} aria-pressed={status === item} onClick={() => setStatus(status === item ? '' : item)}>{DOC_STATUS_LABEL[item]}</button>)}
        </div>
      </div>
      <ul className={`${css.list} ${css.phoneOnly}`}>{filtered.map(row => <li key={row.id}><DocCard row={row} {...props} onOpen={() => props.onNavigate?.(props.kit.documentScreenId, row.id)} /></li>)}</ul>
      <div className={`${css.tableWrap} ${css.desktopOnly}`}>
        <table className={css.table}><thead><tr><th>Номер</th><th>Вид</th><th>Клиент</th><th>Дата</th><th>Статус</th><th data-num>Сумма</th></tr></thead><tbody>
          {filtered.map(row => <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => props.onNavigate?.(props.kit.documentScreenId, row.id)}>
            <td>{textOf(row.values[props.kit.document.number])}</td>
            <td>{choiceName(props.tables, props.kit.documentsTableId, props.kit.document.kind, row.values[props.kit.document.kind])}</td>
            <td>{relatedName(props.allRows, props.tables, row.values[props.kit.document.client])}</td>
            <td>{formatInvoiceDate(toYmd(row.values[props.kit.document.date]) || textOf(row.values[props.kit.document.date]))}</td>
            <td><Badge name={DOC_STATUS_LABEL[resolvedOf(row)]} /></td>
            <td data-num className={css.money}>{formatInvoiceMoney(numOf(row.values[props.kit.document.total]))}</td>
          </tr>)}
        </tbody></table>
      </div>
    </div>
    {filtersOpen ? <FiltersDialog
      clients={clients.map(item => ({ id: item.id, name: textOf(item.values[props.kit.client.name]) }))}
      value={filters}
      onChange={setFilters}
      onClose={() => setFiltersOpen(false)}
    /> : null}
    {createOpen ? <DocumentFormDialog {...props} onClose={() => setCreateOpen(false)} /> : null}
  </ListScreenShell>
}

function FiltersDialog({ clients, value, onChange, onClose }: {
  clients: { id: string; name: string }[]
  value: ListFilters
  onChange: (value: ListFilters) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(value)
  return <AppDialog title="Фильтры" placement="center" onClose={onClose} footer={<div className={css.footerRow}>
    <button type="button" className={buttons.secondary} onClick={() => setDraft({ clientId: '', period: '' })}>Сбросить</button>
    <button type="button" className={buttons.primary} onClick={() => { onChange(draft); onClose() }}>Показать</button>
  </div>}>
    <div className={css.formGrid}>
      <ChoiceRow label="Клиент" value={draft.clientId} options={[{ id: '', name: 'Все' }, ...clients]} onChange={clientId => setDraft(current => ({ ...current, clientId }))} />
      <ChoiceRow label="Период" value={draft.period} options={[{ id: '', name: 'Все даты' }, { id: 'month', name: 'Текущий месяц' }]} onChange={period => setDraft(current => ({ ...current, period }))} />
    </div>
  </AppDialog>
}

function DocCard({ row, onOpen, ...props }: ScreenProps & { row: AppV2Record; onOpen: () => void }) {
  const status = resolveDocStatus({
    status: docStatus(row, props.kit, props.tables),
    due: toYmd(row.values[props.kit.document.due]),
    total: numOf(row.values[props.kit.document.total]),
    payments: parsePayments(row.values[props.kit.document.payments]),
  })
  return <button type="button" className={css.card} onClick={onOpen}>
    <span className={css.cardTitle}>{textOf(row.values[props.kit.document.number])}</span>
    <span className={css.cardMeta}>{relatedName(props.allRows, props.tables, row.values[props.kit.document.client])} · {choiceName(props.tables, props.kit.documentsTableId, props.kit.document.kind, row.values[props.kit.document.kind])}</span>
    <span className={css.cardFoot}>
      <Badge name={DOC_STATUS_LABEL[status]} />
      <span className={css.money}>{formatInvoiceMoney(numOf(row.values[props.kit.document.total]))}</span>
    </span>
  </button>
}

function DocumentCard(props: ScreenProps & { recordId: string }) {
  const demo = useContext(InvoicesRowsContext)
  const row = props.of(props.kit.documentsTableId).find(item => item.id === props.recordId)
  const [editOpen, setEditOpen] = useState(demo?.open === 'edit')
  const [payOpen, setPayOpen] = useState(demo?.open === 'payment')
  const [pdfOpen, setPdfOpen] = useState(demo?.open === 'pdf')
  if (!row) return null
  const kind = docKind(row, props.kit, props.tables)
  const lines = parseInvoiceLines(row.values[props.kit.document.lines])
  const payments = parsePayments(row.values[props.kit.document.payments])
  const total = numOf(row.values[props.kit.document.total])
  const vat = numOf(row.values[props.kit.document.vatTotal])
  const discount = numOf(row.values[props.kit.document.discountTotal])
  const subtotal = numOf(row.values[props.kit.document.subtotal])
  const balance = remainingBalance(total, payments)
  const convertTarget = convertDocument(kind)
  const statusLabel = (() => {
    const current = docStatus(row, props.kit, props.tables)
    const resolved = resolveDocStatus({
      status: current,
      due: toYmd(row.values[props.kit.document.due]),
      total,
      payments,
    })
    return DOC_STATUS_LABEL[resolved]
  })()
  return <DetailCardShell
    title={textOf(row.values[props.kit.document.number])}
    subtitle={`${DOC_KIND_LABEL[kind]} · ${relatedName(props.allRows, props.tables, row.values[props.kit.document.client])}`}
    badge={<Badge name={statusLabel} />}
    actions={<>
      <button type="button" className={buttons.primary} onClick={() => setEditOpen(true)}>Редактировать</button>
      <button type="button" className={buttons.secondary} onClick={() => setPdfOpen(true)}>PDF</button>
      {kind === 'invoice' ? <button type="button" className={buttons.secondary} onClick={() => setPayOpen(true)}>Внести оплату</button> : null}
      {convertTarget ? <button type="button" className={buttons.secondary} onClick={() => convertDoc(props, row, convertTarget)}>Превратить в {DOC_KIND_LABEL[convertTarget].toLowerCase()}</button> : null}
    </>}
  >
    <div className={css.root}>
      <DetailSection title="Сведения">
        <div className={css.facts}>
          <p className={css.cardMeta}>Дата {formatInvoiceDate(toYmd(row.values[props.kit.document.date]) || textOf(row.values[props.kit.document.date]))}{kind === 'invoice' ? ` · оплатить до ${formatInvoiceDate(toYmd(row.values[props.kit.document.due]) || textOf(row.values[props.kit.document.due]))}` : ''}</p>
          {textOf(row.values[props.kit.document.note]) ? <p className={css.cardMeta}>{textOf(row.values[props.kit.document.note])}</p> : null}
        </div>
      </DetailSection>
      <DetailSection title="Позиции"><LineTable lines={lines} readonly /></DetailSection>
      <DetailSection title="Итоги">
        <div className={css.totals}>
          <div className={css.totalsRow}><span>Подытог</span><span>{formatInvoiceMoney(subtotal)}</span></div>
          <div className={css.totalsRow}><span>Скидка</span><span>{formatInvoiceMoney(discount)}</span></div>
          <div className={css.totalsRow}><span>без НДС</span><span>{formatInvoiceMoney(Math.max(0, total - vat))}</span></div>
          <div className={css.totalsRow}><span>НДС</span><span>{formatInvoiceMoney(vat)}</span></div>
          <div className={css.totalsRow} data-total><span>Итого</span><strong>{formatInvoiceMoney(total)}</strong></div>
          <div className={css.totalsRow}><span>Оплачено</span><span>{formatInvoiceMoney(numOf(row.values[props.kit.document.paid]))}</span></div>
          {kind === 'invoice' ? <div className={css.totalsRow}><span>Остаток</span><span>{formatInvoiceMoney(balance)}</span></div> : null}
        </div>
      </DetailSection>
      {kind === 'invoice' && payments.length ? <DetailSection title="Платежи">
        <ul className={css.list}>{payments.map((payment, index) => <li key={`${payment.date}-${index}`} className={css.card}>
          <span className={css.cardTitle}>{formatInvoiceMoney(payment.amount)}</span>
          <span className={css.cardMeta}>{formatInvoiceDate(payment.date)}{payment.comment ? ` · ${payment.comment}` : ''}</span>
        </li>)}</ul>
      </DetailSection> : null}
    </div>
    {editOpen ? <DocumentFormDialog {...props} row={row} onClose={() => setEditOpen(false)} /> : null}
    {payOpen ? <PaymentDialog {...props} row={row} onClose={() => setPayOpen(false)} /> : null}
    {pdfOpen ? <PdfPreviewDialog {...props} row={row} onClose={() => setPdfOpen(false)} /> : null}
  </DetailCardShell>
}

function LineTable({ lines, readonly, onChange }: { lines: InvoiceLine[]; readonly?: boolean; onChange?: (lines: InvoiceLine[]) => void }) {
  const update = (index: number, patch: Partial<InvoiceLine>) => {
    if (!onChange) return
    const next = lines.map((line, i) => i === index ? { ...line, ...patch } : line)
    onChange(next)
  }
  return <>
    <div className={`${css.tableWrap} ${css.desktopOnly}`}>
      <table className={css.table} data-line-table>
        <thead>
          <tr>
            <th>Наименование</th>
            <th data-num>Кол-во</th>
            <th>Ед.</th>
            <th data-num>Цена</th>
            <th data-num>Скидка</th>
            <th data-num>НДС</th>
            <th data-num>Сумма</th>
            {!readonly ? <th></th> : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => <tr key={`${line.name}-${index}`}>
            <td>{readonly ? (line.name || 'Без названия') : <input aria-label={`Наименование ${index + 1}`} value={line.name} onChange={event => update(index, { name: event.target.value })} />}</td>
            <td data-num>{readonly ? line.qty : <input aria-label={`Количество ${index + 1}`} inputMode="decimal" value={line.qty} onChange={event => update(index, { qty: Number(event.target.value) || 0 })} />}</td>
            <td>{readonly ? line.unit : <input aria-label={`Единица ${index + 1}`} value={line.unit} onChange={event => update(index, { unit: event.target.value })} />}</td>
            <td data-num>{readonly ? formatInvoiceMoney(line.price) : <MoneyField ariaLabel={`Цена ${index + 1}`} value={line.price} onChange={price => update(index, { price })} />}</td>
            <td data-num>{readonly ? `${line.discount}%` : <input aria-label={`Скидка ${index + 1}`} inputMode="decimal" value={line.discount} onChange={event => update(index, { discount: Number(event.target.value) || 0 })} />}</td>
            <td data-num>{readonly ? `${line.vatRate}%` : <input aria-label={`НДС ${index + 1}`} inputMode="decimal" value={line.vatRate} onChange={event => update(index, { vatRate: Number(event.target.value) || 0 })} />}</td>
            <td data-num className={css.money}>{formatInvoiceMoney(lineTotal(line))}</td>
            {!readonly ? <td>{onChange && lines.length > 1 ? <button type="button" className={buttons.secondary} onClick={() => onChange(lines.filter((_, i) => i !== index))}>Удалить</button> : null}</td> : null}
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className={`${css.lines} ${css.phoneOnly}`}>
      {lines.map((line, index) => {
        const sum = lineTotal(line)
        return <article key={`${line.name}-${index}`} className={css.lineCard} data-line>
          {readonly ? <strong className={css.cardTitle}>{line.name || 'Без названия'}</strong> : <div className={css.inputRow}><span>Наименование</span><input aria-label={`Наименование ${index + 1}`} value={line.name} onChange={event => update(index, { name: event.target.value })} /></div>}
          <div className={css.lineGrid}>
            <div className={css.inputRow}><span>Кол-во</span>{readonly ? <span>{line.qty}</span> : <input aria-label={`Количество ${index + 1}`} inputMode="decimal" value={line.qty} onChange={event => update(index, { qty: Number(event.target.value) || 0 })} />}</div>
            <div className={css.inputRow}><span>Ед.</span>{readonly ? <span>{line.unit}</span> : <input aria-label={`Единица ${index + 1}`} value={line.unit} onChange={event => update(index, { unit: event.target.value })} />}</div>
            <div className={css.inputRow}><span>Цена</span>{readonly ? <span className={css.money}>{formatInvoiceMoney(line.price)}</span> : <MoneyField ariaLabel={`Цена ${index + 1}`} value={line.price} onChange={price => update(index, { price })} />}</div>
            <div className={css.inputRow}><span>Скидка %</span>{readonly ? <span>{line.discount}</span> : <input aria-label={`Скидка ${index + 1}`} inputMode="decimal" value={line.discount} onChange={event => update(index, { discount: Number(event.target.value) || 0 })} />}</div>
          </div>
          {readonly
            ? <span className={css.cardMeta}>{line.vatIncluded ? `с НДС ${line.vatRate}%` : `без НДС · ставка ${line.vatRate}%`} · {formatInvoiceMoney(sum)}</span>
            : <>
              <ChoiceRow label="Ставка НДС" value={String(line.vatRate)} options={SELECTABLE_VAT_RATES.map(rate => ({ id: String(rate), name: `${rate}%` }))} onChange={value => update(index, { vatRate: Number(value) })} />
              <ChoiceRow label="Учёт НДС" value={line.vatIncluded ? 'in' : 'ex'} options={[{ id: 'in', name: 'с НДС' }, { id: 'ex', name: 'без НДС' }]} onChange={value => update(index, { vatIncluded: value === 'in' })} />
              <div className={css.lineFoot}><span className={css.money}>{formatInvoiceMoney(sum)}</span>{onChange && lines.length > 1 ? <button type="button" className={buttons.secondary} onClick={() => onChange(lines.filter((_, i) => i !== index))}>Удалить</button> : null}</div>
            </>}
        </article>
      })}
    </div>
  </>
}

function settingsRow(props: ScreenProps) {
  return props.of(props.kit.settingsTableId)[0] ?? null
}

async function loadPdfImage(url: string | undefined): Promise<InvoicePdfImage | null> {
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const mime = (response.headers.get('content-type') ?? '').includes('jpeg') ? 'image/jpeg' as const : 'image/png' as const
    return { bytes: new Uint8Array(await response.arrayBuffer()), mime }
  } catch {
    return null
  }
}

async function downloadPdf(props: ScreenProps, row: AppV2Record) {
  const settings = settingsRow(props)
  const kind = docKind(row, props.kit, props.tables)
  const lines = parseInvoiceLines(row.values[props.kit.document.lines]).map(line => ({
    name: line.name, qty: line.qty, unit: line.unit, price: line.price, discount: line.discount, total: lineTotal(line),
  }))
  const clientIds = relationIds(row.values[props.kit.document.client])
  const client = props.allRows.find(item => clientIds.includes(item.id))
  const logoUrl = mediaFiles(settings?.values[props.kit.settings.logo])[0]?.url
  const signatureUrl = mediaFiles(settings?.values[props.kit.settings.signature])[0]?.url
  const stampUrl = mediaFiles(settings?.values[props.kit.settings.stamp])[0]?.url
  const [font, logo, signature, stamp] = await Promise.all([
    fetch('/template-media/dispatch/NotoSans-Regular.ttf').then(response => response.arrayBuffer()),
    loadPdfImage(logoUrl),
    loadPdfImage(signatureUrl),
    loadPdfImage(stampUrl),
  ])
  const pdf = await buildInvoicePdf({
    kind,
    number: textOf(row.values[props.kit.document.number]),
    date: formatInvoiceDate(toYmd(row.values[props.kit.document.date]) || textOf(row.values[props.kit.document.date])),
    due: formatInvoiceDate(toYmd(row.values[props.kit.document.due]) || textOf(row.values[props.kit.document.due])),
    seller: {
      company: textOf(settings?.values[props.kit.settings.companyName]),
      inn: textOf(settings?.values[props.kit.settings.inn]),
      kpp: textOf(settings?.values[props.kit.settings.kpp]),
      address: textOf(settings?.values[props.kit.settings.address]),
      bank: textOf(settings?.values[props.kit.settings.bank]),
      bik: textOf(settings?.values[props.kit.settings.bik]),
      account: textOf(settings?.values[props.kit.settings.account]),
      corrAccount: textOf(settings?.values[props.kit.settings.corrAccount]),
    },
    buyer: {
      name: client ? textOf(client.values[props.kit.client.name]) : '—',
      inn: client ? textOf(client.values[props.kit.client.inn]) : '',
      address: client ? textOf(client.values[props.kit.client.address]) : '',
    },
    lines,
    subtotal: numOf(row.values[props.kit.document.subtotal]),
    discount: numOf(row.values[props.kit.document.discountTotal]),
    vat: numOf(row.values[props.kit.document.vatTotal]),
    total: numOf(row.values[props.kit.document.total]),
    note: textOf(row.values[props.kit.document.note]),
    logo,
    signature,
    stamp,
  }, new Uint8Array(font))
  const blob = new Blob([new Uint8Array(pdf)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${textOf(row.values[props.kit.document.number]) || 'document'}.pdf`
  anchor.click()
  URL.revokeObjectURL(url)
}

function convertDoc(props: ScreenProps, row: AppV2Record, target: DocKind) {
  const settings = settingsRow(props)
  const numbers = props.of(props.kit.documentsTableId).map(item => textOf(item.values[props.kit.document.number]))
  const templates = {
    estimate: textOf(settings?.values[props.kit.settings.numberingEstimate]) || 'СМ-{YYYY}-{NNN}',
    invoice: textOf(settings?.values[props.kit.settings.numberingInvoice]) || 'СЧ-{YYYY}-{NNN}',
    act: textOf(settings?.values[props.kit.settings.numberingAct]) || 'АКТ-{YYYY}-{NNN}',
  }
  const number = nextDocumentNumber(target, numbers, templates)
  const id = `doc_${Math.random().toString(36).slice(2, 10)}`
  const values: Record<string, AppV2Json> = {
    ...row.values,
    [props.kit.document.number]: number,
    [props.kit.document.kind]: props.kit.kinds[target],
    [props.kit.document.source]: [row.id],
    [props.kit.document.status]: target === 'act' ? props.kit.statuses.sent : props.kit.statuses.draft,
    [props.kit.document.date]: todayYmd(),
    [props.kit.document.due]: target === 'invoice' ? String(row.values[props.kit.document.due] ?? todayYmd()) : '',
    [props.kit.document.paid]: target === 'act' ? numOf(row.values[props.kit.document.paid]) : 0,
    [props.kit.document.payments]: target === 'act' ? textOf(row.values[props.kit.document.payments]) : '[]',
  }
  const next: AppV2Record = { id, tableId: props.kit.documentsTableId, values }
  props.replace?.([...props.allRows, next])
  props.onNavigate?.(props.kit.documentScreenId, id)
}

function DocumentFormDialog(props: ScreenProps & { row?: AppV2Record; onClose: () => void }) {
  const clients = props.of(props.kit.clientsTableId)
  const products = props.of(props.kit.productsTableId)
  const initialLines = props.row ? parseInvoiceLines(props.row.values[props.kit.document.lines]) : [emptyInvoiceLine()]
  const [number, setNumber] = useState(props.row ? textOf(props.row.values[props.kit.document.number]) : '')
  const [kind, setKind] = useState(props.row ? choiceName(props.tables, props.kit.documentsTableId, props.kit.document.kind, props.row.values[props.kit.document.kind]) : 'Смета')
  const [client, setClient] = useState(() => relationIds(props.row?.values[props.kit.document.client])[0] ?? clients[0]?.id ?? '')
  const [date, setDate] = useState(toYmd(props.row?.values[props.kit.document.date]) || todayYmd())
  const [due, setDue] = useState(toYmd(props.row?.values[props.kit.document.due]) || todayYmd())
  const [status, setStatus] = useState(props.row ? choiceName(props.tables, props.kit.documentsTableId, props.kit.document.status, props.row.values[props.kit.document.status]) : 'Черновик')
  const [note, setNote] = useState(textOf(props.row?.values[props.kit.document.note]))
  const [lines, setLines] = useState(initialLines)
  const [clientFormOpen, setClientFormOpen] = useState(false)
  const totals = computeInvoiceTotals(lines)
  const addFromCatalog = (id: string) => {
    const item = products.find(row => row.id === id)
    if (!item) return
    const vatLabel = choiceName(props.tables, props.kit.productsTableId, props.kit.product.vatIncluded, item.values[props.kit.product.vatIncluded])
    const vatRate = Number(choiceName(props.tables, props.kit.productsTableId, props.kit.product.vatRate, item.values[props.kit.product.vatRate]) || 20)
    setLines([...lines, {
      name: textOf(item.values[props.kit.product.name]),
      qty: 1,
      unit: textOf(item.values[props.kit.product.unit]) || 'шт',
      price: numOf(item.values[props.kit.product.price]),
      discount: 0,
      vatRate,
      vatIncluded: vatLabel !== 'без НДС',
    }])
  }
  const save = () => {
    const statusId = props.tables.find(table => table.id === props.kit.documentsTableId)?.fields.find(field => field.id === props.kit.document.status)?.choices?.find(choice => choice.name === status)?.id ?? props.kit.statuses.draft
    const kindId = props.tables.find(table => table.id === props.kit.documentsTableId)?.fields.find(field => field.id === props.kit.document.kind)?.choices?.find(choice => choice.name === kind)?.id ?? props.kit.kinds.estimate
    const payments = props.row ? parsePayments(props.row.values[props.kit.document.payments]) : []
    const resolved = resolveDocStatus({ status: DOC_STATUS_FROM_LABEL[status] ?? 'draft', due, total: totals.total, payments })
    const resolvedId = props.tables.find(table => table.id === props.kit.documentsTableId)?.fields.find(field => field.id === props.kit.document.status)?.choices?.find(choice => choice.name === DOC_STATUS_LABEL[resolved])?.id ?? statusId
    const settings = settingsRow(props)
    const kindKey = DOC_KIND_FROM_LABEL[kind] ?? 'estimate'
    const autoNumber = number.trim() || nextDocumentNumber(kindKey, props.of(props.kit.documentsTableId).map(item => textOf(item.values[props.kit.document.number])), {
      estimate: textOf(settings?.values[props.kit.settings.numberingEstimate]) || 'СМ-{YYYY}-{NNN}',
      invoice: textOf(settings?.values[props.kit.settings.numberingInvoice]) || 'СЧ-{YYYY}-{NNN}',
      act: textOf(settings?.values[props.kit.settings.numberingAct]) || 'АКТ-{YYYY}-{NNN}',
    })
    const payload: Record<string, AppV2Json> = {
      [props.kit.document.number]: autoNumber,
      [props.kit.document.kind]: kindId,
      [props.kit.document.client]: client ? [client] : [],
      [props.kit.document.date]: date,
      [props.kit.document.due]: kind === 'Счёт' ? due : '',
      [props.kit.document.status]: resolvedId,
      [props.kit.document.lines]: serializeInvoiceLines(lines),
      [props.kit.document.note]: note,
      [props.kit.document.subtotal]: totals.subtotal,
      [props.kit.document.discountTotal]: totals.discount,
      [props.kit.document.vatTotal]: totals.vat,
      [props.kit.document.total]: totals.total,
      [props.kit.document.paid]: props.row ? numOf(props.row.values[props.kit.document.paid]) : 0,
      [props.kit.document.payments]: props.row ? textOf(props.row.values[props.kit.document.payments]) : '[]',
    }
    if (props.row) patchRow(props, props.row, payload)
    else {
      const id = `doc_${Math.random().toString(36).slice(2, 10)}`
      props.replace?.([...props.allRows, { id, tableId: props.kit.documentsTableId, values: payload }])
    }
    props.onClose()
  }
  return <>
    <AppDialog title={props.row ? 'Редактировать документ' : 'Новый документ'} placement="center" onClose={props.onClose} footer={<button type="button" className={buttons.primary} onClick={save}>Сохранить</button>}>
      <div className={css.formGrid}>
        <div className={css.inputRow}><span>Номер</span><input value={number} onChange={event => setNumber(event.target.value)} /></div>
        <ChoiceRow label="Вид" value={kind} options={['Смета', 'Счёт', 'Акт'].map(name => ({ id: name, name }))} onChange={setKind} />
        <SearchPick
          label="Клиент"
          value={client}
          options={clients.map(item => ({ id: item.id, name: textOf(item.values[props.kit.client.name]) }))}
          onChange={setClient}
          placeholder="Выберите клиента"
          searchLabel="Найти клиента"
          footer={<button type="button" className={buttons.secondary} onClick={() => setClientFormOpen(true)}><ProtoIcon name="plus" size={14} />Новый клиент</button>}
        />
        <SearchDate label="Дата" value={date} onValue={setDate} />
        {kind === 'Счёт' ? <SearchDate label="Оплатить до" value={due} onValue={setDue} /> : null}
        <ChoiceRow label="Статус" value={status} options={Object.values(DOC_STATUS_LABEL).map(name => ({ id: name, name }))} onChange={setStatus} />
        <div className={css.inputRow}><span>Комментарий</span><textarea rows={2} value={note} onChange={event => setNote(event.target.value)} /></div>
        <DetailSection title="Позиции">
          <div className={css.lineTools}>
            <button type="button" className={buttons.secondary} onClick={() => setLines([...lines, emptyInvoiceLine()])}>Строка вручную</button>
          </div>
          <SearchPick
            label="Из каталога"
            value=""
            options={products.map(item => ({ id: item.id, name: textOf(item.values[props.kit.product.name]) }))}
            onChange={addFromCatalog}
            placeholder="Добавить позицию"
            searchLabel="Найти в каталоге"
          />
          <LineTable lines={lines} onChange={setLines} />
          <div className={css.totals}><div className={css.totalsRow} data-total><span>Итого</span><strong>{formatInvoiceMoney(totals.total)}</strong></div></div>
        </DetailSection>
      </div>
    </AppDialog>
    {clientFormOpen ? <ClientFormDialog {...props} onClose={() => setClientFormOpen(false)} onCreated={id => { setClient(id); setClientFormOpen(false) }} /> : null}
  </>
}

function PaymentDialog(props: ScreenProps & { row: AppV2Record; onClose: () => void }) {
  const payments = parsePayments(props.row.values[props.kit.document.payments])
  const total = numOf(props.row.values[props.kit.document.total])
  const [amount, setAmount] = useState(remainingBalance(total, payments))
  const [date, setDate] = useState(todayYmd())
  const [comment, setComment] = useState('')
  const save = () => {
    const entry: PaymentEntry = { date, amount: amount || 0, comment }
    const nextPayments = [...payments, entry]
    const paid = paymentsTotal(nextPayments)
    const resolved = resolveDocStatus({
      status: 'sent',
      due: toYmd(props.row.values[props.kit.document.due]),
      total,
      payments: nextPayments,
    })
    const statusId = props.tables.find(table => table.id === props.kit.documentsTableId)?.fields.find(field => field.id === props.kit.document.status)?.choices?.find(choice => choice.name === DOC_STATUS_LABEL[resolved])?.id ?? props.kit.statuses.partial
    patchRow(props, props.row, {
      [props.kit.document.payments]: serializePayments(nextPayments),
      [props.kit.document.paid]: paid,
      [props.kit.document.status]: statusId,
    })
    props.onClose()
  }
  return <AppDialog title="Оплата" placement="center" onClose={props.onClose} footer={<button type="button" className={buttons.primary} onClick={save}>Записать</button>}>
    <div className={css.formGrid}>
      <p className={css.cardMeta}>Остаток: {formatInvoiceMoney(remainingBalance(total, payments))}</p>
      {payments.length ? <ul className={css.list}>{payments.map((payment, index) => <li key={`${payment.date}-${index}`} className={css.card}>
        <span className={css.cardTitle}>{formatInvoiceMoney(payment.amount)}</span>
        <span className={css.cardMeta}>{formatInvoiceDate(payment.date)}{payment.comment ? ` · ${payment.comment}` : ''}</span>
      </li>)}</ul> : null}
      <MoneyField label="Сумма" ariaLabel="Сумма оплаты" value={amount} onChange={setAmount} />
      <SearchDate label="Дата оплаты" value={date} onValue={setDate} />
      <div className={css.inputRow}><span>Комментарий</span><input aria-label="Комментарий к оплате" value={comment} onChange={event => setComment(event.target.value)} /></div>
    </div>
  </AppDialog>
}

function PdfPreviewDialog(props: ScreenProps & { row: AppV2Record; onClose: () => void }) {
  const settings = settingsRow(props)
  const kind = docKind(props.row, props.kit, props.tables)
  const lines = parseInvoiceLines(props.row.values[props.kit.document.lines])
  const total = numOf(props.row.values[props.kit.document.total])
  const vat = numOf(props.row.values[props.kit.document.vatTotal])
  const discount = numOf(props.row.values[props.kit.document.discountTotal])
  const clientName = relatedName(props.allRows, props.tables, props.row.values[props.kit.document.client])
  const logo = mediaFiles(settings?.values[props.kit.settings.logo])[0]?.url
  const signature = mediaFiles(settings?.values[props.kit.settings.signature])[0]?.url
  const stamp = mediaFiles(settings?.values[props.kit.settings.stamp])[0]?.url
  const showDiscount = lines.some(line => line.discount > 0) || discount > 0
  const partySeller = kind === 'act' ? 'Исполнитель' : 'Продавец'
  const partyBuyer = kind === 'act' ? 'Заказчик' : 'Покупатель'
  return <AppDialog title={`PDF · ${DOC_KIND_LABEL[kind]}`} placement="center" onClose={props.onClose} footer={<button type="button" className={buttons.primary} onClick={() => void downloadPdf(props, props.row)}>Скачать</button>}>
    <div className={css.pdfPreview} data-pdf-preview>
      <header>
        {logo ? <img className={css.pdfLogo} src={logo} alt="" /> : null}
        <strong>{textOf(settings?.values[props.kit.settings.companyName]) || 'Компания'}</strong>
        <span>ИНН {textOf(settings?.values[props.kit.settings.inn])}{textOf(settings?.values[props.kit.settings.kpp]) ? ` · КПП ${textOf(settings?.values[props.kit.settings.kpp])}` : ''}</span>
        <span>{textOf(settings?.values[props.kit.settings.address])}</span>
        {textOf(settings?.values[props.kit.settings.bank]) ? <span>Банк: {textOf(settings?.values[props.kit.settings.bank])}</span> : null}
        {textOf(settings?.values[props.kit.settings.bik]) ? <span>БИК: {textOf(settings?.values[props.kit.settings.bik])}</span> : null}
        {textOf(settings?.values[props.kit.settings.account]) ? <span>Р/с: {textOf(settings?.values[props.kit.settings.account])}</span> : null}
        {textOf(settings?.values[props.kit.settings.corrAccount]) ? <span>К/с: {textOf(settings?.values[props.kit.settings.corrAccount])}</span> : null}
      </header>
      <h2>{DOC_KIND_LABEL[kind]} № {textOf(props.row.values[props.kit.document.number])} от {formatInvoiceDate(toYmd(props.row.values[props.kit.document.date]) || textOf(props.row.values[props.kit.document.date]))}</h2>
      <p>{partySeller}: {textOf(settings?.values[props.kit.settings.companyName]) || '—'}</p>
      <p>{partyBuyer}: {clientName || '—'}</p>
      {kind === 'act' ? <p className={css.cardMeta}>Услуги выполнены полностью и в срок, претензий по объёму, качеству и срокам выполнения работ заказчик не имеет.</p> : null}
      <div className={css.tableWrap}>
        <table className={css.table} data-pdf-lines>
          <thead>
            <tr>
              <th>Наименование</th>
              <th data-num>Кол-во</th>
              <th>Ед.</th>
              <th data-num>Цена</th>
              {showDiscount ? <th data-num>Скидка</th> : null}
              <th data-num>Сумма</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => <tr key={`${line.name}-${index}`}>
              <td data-name>{line.name}</td>
              <td data-num>{line.qty}</td>
              <td data-unit>{line.unit}</td>
              <td data-num>{formatInvoiceMoney(line.price)}</td>
              {showDiscount ? <td data-num>{line.discount ? `${line.discount}%` : '—'}</td> : null}
              <td data-num>{formatInvoiceMoney(lineTotal(line))}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className={css.totals}>
        <div className={css.totalsRow}><span>Скидка</span><span>{formatInvoiceMoney(discount)}</span></div>
        <div className={css.totalsRow}><span>В т.ч. НДС</span><span>{formatInvoiceMoney(vat)}</span></div>
        <div className={css.totalsRow} data-total><span>Итого</span><strong>{formatInvoiceMoney(total)}</strong></div>
        <span>{amountInWordsRu(total)}</span>
      </div>
      <footer className={css.pdfMarks} data-pdf-marks>
        <figure>
          <figcaption>{kind === 'act' ? 'Исполнитель' : 'Подпись'}</figcaption>
          {signature ? <img src={signature} alt="Подпись" /> : <span>—</span>}
        </figure>
        <figure>
          <figcaption>{kind === 'act' ? 'Заказчик' : 'Печать'}</figcaption>
          {stamp ? <img src={stamp} alt="Печать" /> : <span>—</span>}
        </figure>
      </footer>
    </div>
  </AppDialog>
}

function ClientsList(props: ScreenProps) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const rows = props.of(props.kit.clientsTableId).filter(row => !search || textOf(row.values[props.kit.client.name]).toLowerCase().includes(search.toLowerCase()))
  return <ListScreenShell title="Клиенты" search={<ShellSearchField value={search} onChange={setSearch} placeholder="Поиск клиента" />} actions={<button type="button" className={buttons.primary} onClick={() => setOpen(true)}><ProtoIcon name="plus" size={16} />Новый клиент</button>}>
    <ul className={css.list}>{rows.map(row => <li key={row.id}><article className={css.card}>
      <strong className={css.cardTitle}>{textOf(row.values[props.kit.client.name])}</strong>
      <span className={css.cardMeta}>{textOf(row.values[props.kit.client.phone])} · {textOf(row.values[props.kit.client.email])}</span>
      <span className={css.cardMeta}>ИНН {textOf(row.values[props.kit.client.inn])}</span>
    </article></li>)}</ul>
    {open ? <ClientFormDialog {...props} onClose={() => setOpen(false)} /> : null}
  </ListScreenShell>
}

function ClientFormDialog(props: ScreenProps & { row?: AppV2Record; onClose: () => void; onCreated?: (id: string) => void }) {
  const [name, setName] = useState(textOf(props.row?.values[props.kit.client.name]))
  const [phone, setPhone] = useState(textOf(props.row?.values[props.kit.client.phone]))
  const [email, setEmail] = useState(textOf(props.row?.values[props.kit.client.email]))
  const [inn, setInn] = useState(textOf(props.row?.values[props.kit.client.inn]))
  const [address, setAddress] = useState(textOf(props.row?.values[props.kit.client.address]))
  const [note, setNote] = useState(textOf(props.row?.values[props.kit.client.note]))
  const save = () => {
    const payload: Record<string, AppV2Json> = {
      [props.kit.client.name]: name, [props.kit.client.phone]: phone, [props.kit.client.email]: email,
      [props.kit.client.inn]: inn, [props.kit.client.address]: address, [props.kit.client.note]: note,
    }
    if (props.row) {
      patchRow(props, props.row, payload)
      props.onClose()
    } else {
      const id = `cli_${Math.random().toString(36).slice(2, 9)}`
      props.replace?.([...props.allRows, { id, tableId: props.kit.clientsTableId, values: payload }])
      props.onCreated?.(id)
      props.onClose()
    }
  }
  return <AppDialog title="Клиент" placement="center" onClose={props.onClose} footer={<button type="button" className={buttons.primary} onClick={save}>Сохранить</button>}>
    <div className={css.formGrid}>
      {[{ label: 'Клиент', value: name, set: setName }, { label: 'Телефон', value: phone, set: setPhone }, { label: 'Почта', value: email, set: setEmail }, { label: 'ИНН', value: inn, set: setInn }].map(field => <div key={field.label} className={css.inputRow}><span>{field.label}</span><input value={field.value} onChange={event => field.set(event.target.value)} /></div>)}
      <div className={css.inputRow}><span>Адрес</span><textarea rows={2} value={address} onChange={event => setAddress(event.target.value)} /></div>
      <div className={css.inputRow}><span>Заметки</span><textarea rows={2} value={note} onChange={event => setNote(event.target.value)} /></div>
    </div>
  </AppDialog>
}

function ProductsList(props: ScreenProps) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const rows = props.of(props.kit.productsTableId).filter(row => !search || textOf(row.values[props.kit.product.name]).toLowerCase().includes(search.toLowerCase()))
  return <ListScreenShell title="Каталог" search={<ShellSearchField value={search} onChange={setSearch} placeholder="Поиск позиции" />} actions={<button type="button" className={buttons.primary} onClick={() => setOpen(true)}><ProtoIcon name="plus" size={16} />Новая позиция</button>}>
    <ul className={css.list}>{rows.map(row => <li key={row.id}><article className={css.card}>
      <strong className={css.cardTitle}>{textOf(row.values[props.kit.product.name])}</strong>
      <span className={css.cardMeta}>{textOf(row.values[props.kit.product.unit])} · НДС {choiceName(props.tables, props.kit.productsTableId, props.kit.product.vatRate, row.values[props.kit.product.vatRate])}%</span>
      <span className={css.money}>{formatInvoiceMoney(numOf(row.values[props.kit.product.price]))}</span>
    </article></li>)}</ul>
    {open ? <ProductFormDialog {...props} onClose={() => setOpen(false)} /> : null}
  </ListScreenShell>
}

function ProductFormDialog(props: ScreenProps & { row?: AppV2Record; onClose: () => void }) {
  const [name, setName] = useState(textOf(props.row?.values[props.kit.product.name]))
  const [unit, setUnit] = useState(textOf(props.row?.values[props.kit.product.unit]) || 'шт')
  const [price, setPrice] = useState(numOf(props.row?.values[props.kit.product.price]))
  const [vatRate, setVatRate] = useState(choiceName(props.tables, props.kit.productsTableId, props.kit.product.vatRate, props.row?.values[props.kit.product.vatRate]) || '20')
  const [vatMode, setVatMode] = useState(choiceName(props.tables, props.kit.productsTableId, props.kit.product.vatIncluded, props.row?.values[props.kit.product.vatIncluded]) || 'с НДС')
  const [description, setDescription] = useState(textOf(props.row?.values[props.kit.product.description]))
  const field = (fieldId: string) => props.tables.find(table => table.id === props.kit.productsTableId)?.fields.find(item => item.id === fieldId)
  const save = () => {
    const vatRateId = field(props.kit.product.vatRate)?.choices?.find(choice => choice.name === vatRate)?.id
    const vatIncludedId = field(props.kit.product.vatIncluded)?.choices?.find(choice => choice.name === vatMode)?.id
    const payload: Record<string, AppV2Json> = {
      [props.kit.product.name]: name, [props.kit.product.unit]: unit, [props.kit.product.price]: price || 0,
      [props.kit.product.vatRate]: vatRateId ?? '', [props.kit.product.vatIncluded]: vatIncludedId ?? '', [props.kit.product.description]: description,
    }
    if (props.row) patchRow(props, props.row, payload)
    else props.replace?.([...props.allRows, { id: `prd_${Math.random().toString(36).slice(2, 9)}`, tableId: props.kit.productsTableId, values: payload }])
    props.onClose()
  }
  return <AppDialog title="Позиция каталога" placement="center" onClose={props.onClose} footer={<button type="button" className={buttons.primary} onClick={save}>Сохранить</button>}>
    <div className={css.formGrid}>
      <div className={css.inputRow}><span>Название</span><input value={name} onChange={event => setName(event.target.value)} /></div>
      <div className={css.inputRow}><span>Единица</span><input value={unit} onChange={event => setUnit(event.target.value)} /></div>
      <MoneyField label="Цена" value={price} onChange={setPrice} />
      <ChoiceRow label="НДС" value={vatRate} options={['0', '10', '20'].map(item => ({ id: item, name: `${item}%` }))} onChange={setVatRate} />
      <ChoiceRow label="Учёт НДС" value={vatMode} options={[{ id: 'с НДС', name: 'с НДС' }, { id: 'без НДС', name: 'без НДС' }]} onChange={setVatMode} />
      <div className={css.inputRow}><span>Описание</span><textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} /></div>
    </div>
  </AppDialog>
}

function SettingsCard(props: ScreenProps) {
  const row = settingsRow(props)
  const [draft, setDraft] = useState<Record<string, AppV2Json>>(() => (row ? { ...row.values } : {}))
  if (!row) return null
  const set = (fieldId: string, value: string) => setDraft(current => ({ ...current, [fieldId]: value }))
  const entries: [string, string][] = [
    ['Компания', props.kit.settings.companyName], ['ИНН', props.kit.settings.inn], ['КПП', props.kit.settings.kpp], ['Адрес', props.kit.settings.address],
    ['Банк', props.kit.settings.bank], ['БИК', props.kit.settings.bik], ['Расчётный счёт', props.kit.settings.account], ['Корр. счёт', props.kit.settings.corrAccount],
    ['Телефон', props.kit.settings.phone], ['Почта', props.kit.settings.email],
    ['Нумерация смет', props.kit.settings.numberingEstimate], ['Нумерация счетов', props.kit.settings.numberingInvoice], ['Нумерация актов', props.kit.settings.numberingAct],
  ]
  const logo = mediaFiles(draft[props.kit.settings.logo])[0]?.url
  const signature = mediaFiles(draft[props.kit.settings.signature])[0]?.url
  const stamp = mediaFiles(draft[props.kit.settings.stamp])[0]?.url
  return <DetailCardShell title="Настройки" subtitle="Реквизиты и нумерация документов">
    <div className={css.formGrid}>
      {entries.map(([label, fieldId]) => <div key={fieldId} className={css.inputRow}><span>{label}</span><input value={textOf(draft[fieldId])} onChange={event => set(fieldId, event.target.value)} /></div>)}
      <div className={css.mediaPreview}>
        {logo ? <img src={logo} alt="Логотип" /> : null}
        {signature ? <img src={signature} alt="Подпись" /> : null}
        {stamp ? <img src={stamp} alt="Печать" /> : null}
      </div>
      <button type="button" className={buttons.primary} onClick={() => patchRow(props, row, { ...draft })}>Сохранить</button>
    </div>
  </DetailCardShell>
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={css.summaryCard} data-tone={tone}><span>{label}</span><strong>{value}</strong></div>
}

function SearchDate({ label, value, onValue }: { label: string; value: string; onValue: (value: string) => void }) {
  return <div className={css.inputRow}><span>{label}</span><DateMenu value={value} onValue={onValue} label={label} /></div>
}
