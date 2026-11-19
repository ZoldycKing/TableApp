'use client'
import { createContext, useContext, useMemo, useState } from 'react'
import type { AppV2, AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import {
  DOC_KIND_FROM_LABEL, DOC_KIND_LABEL, DOC_STATUS_FROM_LABEL, DOC_STATUS_LABEL, SELECTABLE_VAT_RATES,
  amountInWordsRu, computeInvoiceTotals, convertDocument, emptyInvoiceLine, formatInvoiceDate, formatInvoiceMoney,
  lineTotal, nextDocumentNumber, parseInvoiceLines, parsePayments, paymentsTotal, remainingBalance,
  resolveDocStatus, serializeInvoiceLines, serializePayments, summaryTotals, type DocKind, type DocStatus, type InvoiceLine, type PaymentEntry,
} from '@/lib/invoices-logic'
import { buildInvoicePdf } from '@/lib/invoices-pdf'
import { useBuilderV2NodeData } from './use-data'
import { DateMenu } from './booking-calendar'
import { AppDialog } from './app-dialog'
import { DetailCardShell, DetailSection, ListScreenShell, ShellSearchField } from './layout-shell'
import { ProtoIcon } from '../prototype/icons'
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

function CheckToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return <button type="button" role="checkbox" aria-checked={checked} className={css.check} onClick={() => onChange(!checked)}><span data-on={checked || undefined}>{checked ? <ProtoIcon name="check" size={12} /> : null}</span><span>{label}</span></button>
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

function HomeList(props: ScreenProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [clientId, setClientId] = useState('')
  const [period, setPeriod] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const docs = props.of(props.kit.documentsTableId)
  const clients = props.of(props.kit.clientsTableId)
  const resolvedOf = (row: AppV2Record) => resolveDocStatus({
    status: docStatus(row, props.kit, props.tables),
    due: textOf(row.values[props.kit.document.due]),
    total: numOf(row.values[props.kit.document.total]),
    payments: parsePayments(row.values[props.kit.document.payments]),
  })
  const filtered = useMemo(() => docs.filter(row => {
    const number = textOf(row.values[props.kit.document.number])
    const client = relatedName(props.allRows, props.tables, row.values[props.kit.document.client])
    const statusKey = resolvedOf(row)
    if (status && statusKey !== status) return false
    if (clientId && !relationIds(row.values[props.kit.document.client]).includes(clientId)) return false
    const date = textOf(row.values[props.kit.document.date])
    if (period === 'month' && date < monthStart()) return false
    if (search && !`${number} ${client}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [clientId, docs, period, props, search, status])
  const summary = summaryTotals(docs.map(row => ({
    kind: docKind(row, props.kit, props.tables),
    status: resolvedOf(row),
    total: numOf(row.values[props.kit.document.total]),
    paid: numOf(row.values[props.kit.document.paid]),
  })))
  return <ListScreenShell title="Документы" search={<ShellSearchField value={search} onChange={setSearch} placeholder="Номер или клиент" />} actions={<button type="button" onClick={() => setCreateOpen(true)}>Новый документ</button>}>
    <div className={css.root}>
      <div className={css.summary}>
        <SummaryCard label="Выставлено" value={formatInvoiceMoney(summary.issued)} />
        <SummaryCard label="Оплачено" value={formatInvoiceMoney(summary.paid)} />
        <SummaryCard label="Долг" value={formatInvoiceMoney(summary.debt)} tone="debt" />
      </div>
      <div className={css.toolbar}>
        <div className={css.chips}>{STATUSES.map(item => <button key={item} type="button" className={css.chip} aria-pressed={status === item} onClick={() => setStatus(status === item ? '' : item)}>{DOC_STATUS_LABEL[item]}</button>)}</div>
      </div>
      <ChoiceRow label="Клиент" value={clientId} options={[{ id: '', name: 'Все' }, ...clients.map(item => ({ id: item.id, name: textOf(item.values[props.kit.client.name]) }))]} onChange={setClientId} />
      <ChoiceRow label="Период" value={period} options={[{ id: '', name: 'Все даты' }, { id: 'month', name: 'Текущий месяц' }]} onChange={setPeriod} />
      <ul className={`${css.list} ${css.phoneOnly}`}>{filtered.map(row => <li key={row.id}><DocCard row={row} {...props} onOpen={() => props.onNavigate?.(props.kit.documentScreenId, row.id)} /></li>)}</ul>
      <table className={`${css.table} ${css.desktopOnly}`}><thead><tr><th>Номер</th><th>Вид</th><th>Клиент</th><th>Дата</th><th>Статус</th><th>Сумма</th></tr></thead><tbody>
        {filtered.map(row => <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => props.onNavigate?.(props.kit.documentScreenId, row.id)}>
          <td>{textOf(row.values[props.kit.document.number])}</td>
          <td>{choiceName(props.tables, props.kit.documentsTableId, props.kit.document.kind, row.values[props.kit.document.kind])}</td>
          <td>{relatedName(props.allRows, props.tables, row.values[props.kit.document.client])}</td>
          <td>{formatInvoiceDate(textOf(row.values[props.kit.document.date]))}</td>
          <td><Badge name={DOC_STATUS_LABEL[resolvedOf(row)]} /></td>
          <td className={css.money}>{formatInvoiceMoney(numOf(row.values[props.kit.document.total]))}</td>
        </tr>)}
      </tbody></table>
    </div>
    {createOpen ? <DocumentFormDialog {...props} onClose={() => setCreateOpen(false)} /> : null}
  </ListScreenShell>
}

function DocCard({ row, onOpen, ...props }: ScreenProps & { row: AppV2Record; onOpen: () => void }) {
  const status = resolveDocStatus({
    status: docStatus(row, props.kit, props.tables),
    due: textOf(row.values[props.kit.document.due]),
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
  const balance = remainingBalance(total, payments)
  const convertTarget = convertDocument(kind)
  const statusLabel = (() => {
    const current = docStatus(row, props.kit, props.tables)
    const resolved = resolveDocStatus({
      status: current,
      due: textOf(row.values[props.kit.document.due]),
      total,
      payments,
    })
    return DOC_STATUS_LABEL[resolved]
  })()
  return <DetailCardShell title={textOf(row.values[props.kit.document.number])} subtitle={`${DOC_KIND_LABEL[kind]} · ${relatedName(props.allRows, props.tables, row.values[props.kit.document.client])}`}>
    <div className={css.root}>
      <DetailSection title="Сведения">
        <p className={css.cardMeta}>Дата {formatInvoiceDate(textOf(row.values[props.kit.document.date]))}{kind === 'invoice' ? ` · оплатить до ${formatInvoiceDate(textOf(row.values[props.kit.document.due]))}` : ''}</p>
        <Badge name={statusLabel} />
        {textOf(row.values[props.kit.document.note]) ? <p className={css.cardMeta}>{textOf(row.values[props.kit.document.note])}</p> : null}
      </DetailSection>
      <DetailSection title="Позиции"><LineTable lines={lines} readonly /></DetailSection>
      <DetailSection title="Итоги">
        <div className={css.totals}>
          <span>Подытог: {formatInvoiceMoney(numOf(row.values[props.kit.document.subtotal]))}</span>
          <span>Скидка: {formatInvoiceMoney(numOf(row.values[props.kit.document.discountTotal]))}</span>
          <span>НДС: {formatInvoiceMoney(numOf(row.values[props.kit.document.vatTotal]))}</span>
          <strong>Итого: {formatInvoiceMoney(total)}</strong>
          <span>Оплачено: {formatInvoiceMoney(numOf(row.values[props.kit.document.paid]))}</span>
          {kind === 'invoice' ? <span>Остаток: {formatInvoiceMoney(balance)}</span> : null}
        </div>
      </DetailSection>
      {kind === 'invoice' && payments.length ? <DetailSection title="Платежи">
        <ul className={css.list}>{payments.map((payment, index) => <li key={`${payment.date}-${index}`} className={css.card}>
          <span className={css.cardTitle}>{formatInvoiceMoney(payment.amount)}</span>
          <span className={css.cardMeta}>{formatInvoiceDate(payment.date)}{payment.comment ? ` · ${payment.comment}` : ''}</span>
        </li>)}</ul>
      </DetailSection> : null}
      <div className={css.actions}>
        <button type="button" data-primary onClick={() => setEditOpen(true)}>Редактировать</button>
        {kind === 'invoice' ? <button type="button" data-accent onClick={() => setPayOpen(true)}>Оплата</button> : null}
        {convertTarget ? <button type="button" onClick={() => convertDoc(props, row, convertTarget)}>Преобразовать в {DOC_KIND_LABEL[convertTarget]}</button> : null}
        <button type="button" onClick={() => setPdfOpen(true)}>PDF</button>
        <button type="button" onClick={() => void downloadPdf(props, row)}>Скачать PDF</button>
      </div>
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
  return <div className={css.lines}>
    {lines.map((line, index) => {
      const sum = lineTotal(line)
      return <article key={`${line.name}-${index}`} className={css.lineCard} data-line>
        {readonly ? <strong className={css.cardTitle}>{line.name || 'Без названия'}</strong> : <div className={css.inputRow}><span>Наименование</span><input aria-label={`Наименование ${index + 1}`} value={line.name} onChange={event => update(index, { name: event.target.value })} /></div>}
        <div className={css.lineGrid}>
          <div className={css.inputRow}><span>Кол-во</span>{readonly ? <span>{line.qty}</span> : <input aria-label={`Количество ${index + 1}`} inputMode="decimal" value={line.qty} onChange={event => update(index, { qty: Number(event.target.value) || 0 })} />}</div>
          <div className={css.inputRow}><span>Ед.</span>{readonly ? <span>{line.unit}</span> : <input aria-label={`Единица ${index + 1}`} value={line.unit} onChange={event => update(index, { unit: event.target.value })} />}</div>
          <div className={css.inputRow}><span>Цена</span>{readonly ? <span className={css.money}>{formatInvoiceMoney(line.price)}</span> : <input aria-label={`Цена ${index + 1}`} inputMode="decimal" value={line.price} onChange={event => update(index, { price: Number(event.target.value) || 0 })} />}</div>
          <div className={css.inputRow}><span>Скидка %</span>{readonly ? <span>{line.discount}</span> : <input aria-label={`Скидка ${index + 1}`} inputMode="decimal" value={line.discount} onChange={event => update(index, { discount: Number(event.target.value) || 0 })} />}</div>
        </div>
        {readonly
          ? <span className={css.cardMeta}>{line.vatIncluded ? `с НДС ${line.vatRate}%` : `без НДС · ставка ${line.vatRate}%`} · {formatInvoiceMoney(sum)}</span>
          : <>
            <ChoiceRow label="Ставка НДС" value={String(line.vatRate)} options={SELECTABLE_VAT_RATES.map(rate => ({ id: String(rate), name: `${rate}%` }))} onChange={value => update(index, { vatRate: Number(value) })} />
            <ChoiceRow label="Учёт НДС" value={line.vatIncluded ? 'in' : 'ex'} options={[{ id: 'in', name: 'с НДС' }, { id: 'ex', name: 'без НДС' }]} onChange={value => update(index, { vatIncluded: value === 'in' })} />
            <div className={css.lineFoot}><span className={css.money}>{formatInvoiceMoney(sum)}</span>{onChange && lines.length > 1 ? <button type="button" onClick={() => onChange(lines.filter((_, i) => i !== index))}>Удалить</button> : null}</div>
          </>}
      </article>
    })}
  </div>
}

function settingsRow(props: ScreenProps) {
  return props.of(props.kit.settingsTableId)[0] ?? null
}

async function downloadPdf(props: ScreenProps, row: AppV2Record) {
  const settings = settingsRow(props)
  const kind = docKind(row, props.kit, props.tables)
  const lines = parseInvoiceLines(row.values[props.kit.document.lines]).map(line => ({
    name: line.name, qty: line.qty, unit: line.unit, price: line.price, total: computeInvoiceTotals([line]).total,
  }))
  const clientIds = relationIds(row.values[props.kit.document.client])
  const client = props.allRows.find(item => clientIds.includes(item.id))
  const font = await fetch('/template-media/dispatch/NotoSans-Regular.ttf').then(response => response.arrayBuffer())
  const pdf = await buildInvoicePdf({
    kind,
    number: textOf(row.values[props.kit.document.number]),
    date: formatInvoiceDate(textOf(row.values[props.kit.document.date])),
    due: formatInvoiceDate(textOf(row.values[props.kit.document.due])),
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
  const [date, setDate] = useState(textOf(props.row?.values[props.kit.document.date]) || todayYmd())
  const [due, setDue] = useState(textOf(props.row?.values[props.kit.document.due]) || todayYmd())
  const [status, setStatus] = useState(props.row ? choiceName(props.tables, props.kit.documentsTableId, props.kit.document.status, props.row.values[props.kit.document.status]) : 'Черновик')
  const [note, setNote] = useState(textOf(props.row?.values[props.kit.document.note]))
  const [lines, setLines] = useState(initialLines)
  const totals = computeInvoiceTotals(lines)
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
  return <AppDialog title={props.row ? 'Редактировать документ' : 'Новый документ'} placement="center" onClose={props.onClose} footer={<button type="button" data-primary onClick={save}>Сохранить</button>}>
    <div className={css.formGrid}>
      <div className={css.inputRow}><span>Номер</span><input value={number} onChange={event => setNumber(event.target.value)} /></div>
      <ChoiceRow label="Вид" value={kind} options={['Смета', 'Счёт', 'Акт'].map(name => ({ id: name, name }))} onChange={setKind} />
      <ChoiceRow label="Клиент" value={client} options={clients.map(item => ({ id: item.id, name: textOf(item.values[props.kit.client.name]) }))} onChange={setClient} />
      <SearchDate label="Дата" value={date} onValue={setDate} />
      {kind === 'Счёт' ? <SearchDate label="Оплатить до" value={due} onValue={setDue} /> : null}
      <ChoiceRow label="Статус" value={status} options={Object.values(DOC_STATUS_LABEL).map(name => ({ id: name, name }))} onChange={setStatus} />
      <div className={css.inputRow}><span>Комментарий</span><textarea rows={2} value={note} onChange={event => setNote(event.target.value)} /></div>
      <DetailSection title="Позиции">
        <button type="button" onClick={() => setLines([...lines, emptyInvoiceLine()])}>Строка вручную</button>
        <ChoiceRow label="Из каталога" value="" options={[{ id: '', name: '—' }, ...products.map(item => ({ id: item.id, name: textOf(item.values[props.kit.product.name]) }))]} onChange={id => {
          if (!id) return
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
        }} />
        <LineTable lines={lines} onChange={setLines} />
        <div className={css.totals}><strong>Итого: {formatInvoiceMoney(totals.total)}</strong></div>
      </DetailSection>
    </div>
  </AppDialog>
}

function PaymentDialog(props: ScreenProps & { row: AppV2Record; onClose: () => void }) {
  const payments = parsePayments(props.row.values[props.kit.document.payments])
  const total = numOf(props.row.values[props.kit.document.total])
  const [amount, setAmount] = useState(String(remainingBalance(total, payments)))
  const [date, setDate] = useState(todayYmd())
  const [comment, setComment] = useState('')
  const save = () => {
    const entry: PaymentEntry = { date, amount: Number(amount) || 0, comment }
    const nextPayments = [...payments, entry]
    const paid = paymentsTotal(nextPayments)
    const resolved = resolveDocStatus({
      status: 'sent',
      due: textOf(props.row.values[props.kit.document.due]),
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
  return <AppDialog title="Оплата" placement="center" onClose={props.onClose} footer={<button type="button" data-primary onClick={save}>Записать</button>}>
    <div className={css.formGrid}>
      <p className={css.cardMeta}>Остаток: {formatInvoiceMoney(remainingBalance(total, payments))}</p>
      {payments.length ? <ul className={css.list}>{payments.map((payment, index) => <li key={`${payment.date}-${index}`} className={css.card}>
        <span className={css.cardTitle}>{formatInvoiceMoney(payment.amount)}</span>
        <span className={css.cardMeta}>{formatInvoiceDate(payment.date)}{payment.comment ? ` · ${payment.comment}` : ''}</span>
      </li>)}</ul> : null}
      <div className={css.inputRow}><span>Сумма</span><input aria-label="Сумма оплаты" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></div>
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
  const clientName = relatedName(props.allRows, props.tables, props.row.values[props.kit.document.client])
  return <AppDialog title={`PDF · ${DOC_KIND_LABEL[kind]}`} placement="center" onClose={props.onClose} footer={<button type="button" data-primary onClick={() => void downloadPdf(props, props.row)}>Скачать</button>}>
    <div className={css.pdfPreview} data-pdf-preview>
      <header>
        <strong>{textOf(settings?.values[props.kit.settings.companyName]) || 'Компания'}</strong>
        <span>ИНН {textOf(settings?.values[props.kit.settings.inn])}{textOf(settings?.values[props.kit.settings.kpp]) ? ` · КПП ${textOf(settings?.values[props.kit.settings.kpp])}` : ''}</span>
        <span>{textOf(settings?.values[props.kit.settings.address])}</span>
      </header>
      <h2>{DOC_KIND_LABEL[kind]} № {textOf(props.row.values[props.kit.document.number])} от {formatInvoiceDate(textOf(props.row.values[props.kit.document.date]))}</h2>
      <p>Покупатель: {clientName || '—'}</p>
      <table className={css.table}><thead><tr><th>Наименование</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>
        {lines.map((line, index) => <tr key={`${line.name}-${index}`}><td>{line.name}</td><td>{line.qty} {line.unit}</td><td>{formatInvoiceMoney(line.price)}</td><td>{formatInvoiceMoney(lineTotal(line))}</td></tr>)}
      </tbody></table>
      <div className={css.totals}>
        <span>НДС: {formatInvoiceMoney(numOf(props.row.values[props.kit.document.vatTotal]))}</span>
        <strong>Итого: {formatInvoiceMoney(total)}</strong>
        <span>{amountInWordsRu(total)}</span>
      </div>
      <footer className={css.pdfMarks}>
        <span>Подпись</span>
        <span>Печать</span>
      </footer>
    </div>
  </AppDialog>
}

function ClientsList(props: ScreenProps) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const rows = props.of(props.kit.clientsTableId).filter(row => !search || textOf(row.values[props.kit.client.name]).toLowerCase().includes(search.toLowerCase()))
  return <ListScreenShell title="Клиенты" search={<ShellSearchField value={search} onChange={setSearch} placeholder="Поиск клиента" />} actions={<button type="button" onClick={() => setOpen(true)}>Новый клиент</button>}>
    <ul className={css.list}>{rows.map(row => <li key={row.id}><article className={css.card}>
      <strong className={css.cardTitle}>{textOf(row.values[props.kit.client.name])}</strong>
      <span className={css.cardMeta}>{textOf(row.values[props.kit.client.phone])} · {textOf(row.values[props.kit.client.email])}</span>
      <span className={css.cardMeta}>ИНН {textOf(row.values[props.kit.client.inn])}</span>
    </article></li>)}</ul>
    {open ? <ClientFormDialog {...props} onClose={() => setOpen(false)} /> : null}
  </ListScreenShell>
}

function ClientFormDialog(props: ScreenProps & { row?: AppV2Record; onClose: () => void }) {
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
    if (props.row) patchRow(props, props.row, payload)
    else props.replace?.([...props.allRows, { id: `cli_${Math.random().toString(36).slice(2, 9)}`, tableId: props.kit.clientsTableId, values: payload }])
    props.onClose()
  }
  return <AppDialog title="Клиент" placement="center" onClose={props.onClose} footer={<button type="button" data-primary onClick={save}>Сохранить</button>}>
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
  return <ListScreenShell title="Каталог" search={<ShellSearchField value={search} onChange={setSearch} placeholder="Поиск позиции" />} actions={<button type="button" onClick={() => setOpen(true)}>Новая позиция</button>}>
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
  const [price, setPrice] = useState(String(numOf(props.row?.values[props.kit.product.price])))
  const [vatRate, setVatRate] = useState(choiceName(props.tables, props.kit.productsTableId, props.kit.product.vatRate, props.row?.values[props.kit.product.vatRate]) || '20')
  const [vatMode, setVatMode] = useState(choiceName(props.tables, props.kit.productsTableId, props.kit.product.vatIncluded, props.row?.values[props.kit.product.vatIncluded]) || 'с НДС')
  const [description, setDescription] = useState(textOf(props.row?.values[props.kit.product.description]))
  const field = (fieldId: string) => props.tables.find(table => table.id === props.kit.productsTableId)?.fields.find(item => item.id === fieldId)
  const save = () => {
    const vatRateId = field(props.kit.product.vatRate)?.choices?.find(choice => choice.name === vatRate)?.id
    const vatIncludedId = field(props.kit.product.vatIncluded)?.choices?.find(choice => choice.name === vatMode)?.id
    const payload: Record<string, AppV2Json> = {
      [props.kit.product.name]: name, [props.kit.product.unit]: unit, [props.kit.product.price]: Number(price) || 0,
      [props.kit.product.vatRate]: vatRateId ?? '', [props.kit.product.vatIncluded]: vatIncludedId ?? '', [props.kit.product.description]: description,
    }
    if (props.row) patchRow(props, props.row, payload)
    else props.replace?.([...props.allRows, { id: `prd_${Math.random().toString(36).slice(2, 9)}`, tableId: props.kit.productsTableId, values: payload }])
    props.onClose()
  }
  return <AppDialog title="Позиция каталога" placement="center" onClose={props.onClose} footer={<button type="button" data-primary onClick={save}>Сохранить</button>}>
    <div className={css.formGrid}>
      <div className={css.inputRow}><span>Название</span><input value={name} onChange={event => setName(event.target.value)} /></div>
      <div className={css.inputRow}><span>Единица</span><input value={unit} onChange={event => setUnit(event.target.value)} /></div>
      <div className={css.inputRow}><span>Цена</span><input inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} /></div>
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
  return <DetailCardShell title="Настройки" subtitle="Реквизиты и нумерация документов">
    <div className={css.formGrid}>
      {entries.map(([label, fieldId]) => <div key={fieldId} className={css.inputRow}><span>{label}</span><input value={textOf(draft[fieldId])} onChange={event => set(fieldId, event.target.value)} /></div>)}
      <button type="button" data-primary onClick={() => patchRow(props, row, { ...draft })}>Сохранить</button>
    </div>
  </DetailCardShell>
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={css.summaryCard} data-tone={tone}><span>{label}</span><strong>{value}</strong></div>
}

function SearchDate({ label, value, onValue }: { label: string; value: string; onValue: (value: string) => void }) {
  return <div className={css.inputRow}><span>{label}</span><DateMenu value={value} onValue={onValue} label={label} /></div>
}