'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { ruCount } from '@/components/ui/format'
import { formatMoney } from '@/lib/prokat-logic'
import type { DemoCard, DemoCardMessage, DemoClient } from '@/lib/prokat-clients-demo'
import { ProtoIcon } from '../prototype/icons'
import { ListScreenShell } from './layout-shell'
import css from './prokat-clients.module.css'

export type ClientTab = 'all' | 'open' | 'new' | 'stale' | 'none'
type Sort = 'recent' | 'name' | 'sum' | 'next'

const PAGE = 12
const SORTS: readonly { value: Sort; label: string }[] = [
  { value: 'recent', label: 'недавние' },
  { value: 'name', label: 'по имени' },
  { value: 'sum', label: 'по сумме' },
  { value: 'next', label: 'ближайшая бронь' },
]
const PERIODS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'за всё время' },
  { value: 30, label: 'за 30 дней' },
  { value: 90, label: 'за 90 дней' },
]

const keyOf = (stamp: string) => {
  const match = stamp.match(/^(\d\d)\.(\d\d)\.(\d{4})(?:,? (\d\d):(\d\d))?/)
  return match ? Number(`${match[3]}${match[2]}${match[1]}${match[4] ?? '00'}${match[5] ?? '00'}`) : 0
}
const dayNumber = (key: number) => {
  const text = String(key).padStart(12, '0')
  return Math.floor(Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8))) / 86400000)
}

function useNarrow(device: 'auto' | 'desktop' | 'phone') {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 759px)').matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(max-width: 759px)')
    const sync = () => setNarrow(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return device === 'phone' || narrow
}
export { useNarrow as useClientsNarrow }

function Pick<T extends string | number>({ icon, label, value, options, onChange, end }: {
  icon: 'filter' | 'calendar' | 'sort'
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  end?: boolean
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const current = options.find(option => option.value === value) ?? options[0]
  return <span ref={root} className={css.pickWrap} data-end={end || undefined}>
    <button type="button" className={css.pick} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      <ProtoIcon name={icon} size={15} />{label} <b>{current?.label}</b>
    </button>
    {open ? <div className={css.menu} role="menu" aria-label={label}>
      {options.map(option => <button key={String(option.value)} type="button" role="menuitemradio" aria-checked={option.value === value} onClick={() => { onChange(option.value); setOpen(false) }}>{option.label}</button>)}
    </div> : null}
  </span>
}

function Search({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className={css.search}>
    <ProtoIcon name="search" size={16} />
    <input type="search" aria-label="Поиск клиентов" placeholder={placeholder} maxLength={200} value={value} onChange={event => onChange(event.target.value)} />
  </label>
}

export function ClientsView({ rows, tabs, newFrom, staleBefore, nowKey, phone, initialPicked, note, onOpen, onMessage, onBook, onImport, onAdd, addLabel }: {
  rows: readonly DemoClient[]
  tabs: readonly { id: ClientTab; label: string }[]
  newFrom: number
  staleBefore: number
  nowKey: number
  phone: boolean
  initialPicked?: readonly string[]
  note?: string
  addLabel: string
  onOpen: (id: string) => void
  onMessage: () => void
  onBook: () => void
  onImport: () => void
  onAdd: () => void
}) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<ClientTab>('all')
  const [kind, setKind] = useState('')
  const [period, setPeriod] = useState(0)
  const [sort, setSort] = useState<Sort>('recent')
  const [picked, setPicked] = useState<readonly string[]>(initialPicked ?? [])
  const [page, setPage] = useState(0)
  const reset = () => setPage(0)
  const needle = search.trim().toLowerCase()
  const inTab = (row: DemoClient, id: ClientTab) => id === 'all' ? true
    : id === 'open' ? row.open
    : id === 'new' ? row.sinceKey >= newFrom
    : id === 'stale' ? row.lastKey > 0 && row.lastKey < staleBefore
    : row.lastKey === 0
  const matches = rows.filter(row => {
    if (needle && ![row.name, row.phone, row.email].join(' ').toLowerCase().includes(needle)) return false
    if (kind && row.kind.label !== kind) return false
    if (period && (row.lastKey === 0 || dayNumber(nowKey) - dayNumber(row.lastKey) > period)) return false
    return true
  })
  const counts = Object.fromEntries(tabs.map(item => [item.id, matches.filter(row => inTab(row, item.id)).length])) as Record<ClientTab, number>
  const sorted = matches.filter(row => inTab(row, tab)).sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'ru')
    if (sort === 'sum') return b.paid - a.paid
    if (sort === 'next') return (a.next ? keyOf(a.next) : Infinity) - (b.next ? keyOf(b.next) : Infinity)
    return b.lastKey - a.lastKey
  })
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE))
  const current = Math.min(page, pages - 1)
  const visible = sorted.slice(current * PAGE, (current + 1) * PAGE)
  const kinds = [...new Set(rows.map(row => row.kind.label))]
  const toggle = (id: string) => setPicked(list => list.includes(id) ? list.filter(item => item !== id) : [...list, id])
  const openCount = rows.filter(row => row.open).length
  const range = sorted.length ? `${current * PAGE + 1}–${current * PAGE + visible.length} из ${sorted.length}` : '0'
  const pager = <span className={css.pg}>
    <span className={css.mono}>{range}</span>
    <button type="button" className={css.ib} aria-label="Предыдущая страница" disabled={current === 0} onClick={() => setPage(current - 1)}><ProtoIcon name="back" size={15} /></button>
    <button type="button" className={css.ib} aria-label="Следующая страница" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}><ProtoIcon name="arrow" size={15} /></button>
  </span>
  const tabButtons = (chips: boolean): ReactNode => tabs.map(item => <button key={item.id} type="button" role="tab" className={chips ? css.chip : css.tab} aria-selected={tab === item.id} onClick={() => { setTab(item.id); reset() }}>{item.label}<em>{counts[item.id]}</em></button>)
  const desktopActions = <span className={css.deskOnly}>
    <button type="button" className={css.btn} data-o="" onClick={onImport}><ProtoIcon name="download" size={16} />Импорт из таблицы</button>
    <button type="button" className={css.btn} onClick={onAdd}><ProtoIcon name="plus" size={16} />{addLabel}</button>
  </span>
  const phoneActions = <span className={css.phoneOnly}>
    <button type="button" className={css.ib} aria-label="Импорт из таблицы" onClick={onImport}><ProtoIcon name="download" size={16} /></button>
    <button type="button" className={css.ib} aria-label={addLabel} onClick={onAdd}><ProtoIcon name="plus" size={16} /></button>
  </span>
  return <div className={css.root} data-prokat-root data-prokat-screen="clients" data-phone={phone || undefined}>
    <ListScreenShell
      title="Клиенты"
      meta={phone
        ? `${ruCount(rows.length, 'клиент', 'клиента', 'клиентов')} · ${openCount} с записью`
        : `${ruCount(rows.length, 'клиент', 'клиента', 'клиентов')}: кто брал и когда придёт снова`}
      actions={<>{desktopActions}{phoneActions}</>}
      filterBar={<>
        <div className={css.tabs} role="tablist" aria-label="Списки клиентов">{tabButtons(false)}</div>
        <div className={css.phoneSearch}><Search value={search} onChange={value => { setSearch(value); reset() }} placeholder="Имя, телефон или почта" /></div>
        <div className={css.chips} role="tablist" aria-label="Списки клиентов">{tabButtons(true)}</div>
        <div className={css.ctb}>
          <span className={css.deskOnly}>
            <Search value={search} onChange={value => { setSearch(value); reset() }} placeholder="Имя, телефон или почта" />
          </span>
          <Pick icon="filter" label="Что брал" value={kind} options={[{ value: '', label: 'любой' }, ...kinds.map(label => ({ value: label, label }))]} onChange={value => { setKind(value); reset() }} />
          <Pick icon="calendar" label="Последний визит" value={period} options={PERIODS} onChange={value => { setPeriod(value); reset() }} />
          <Pick icon="sort" label="Сначала" value={sort} options={SORTS} onChange={value => { setSort(value); reset() }} end />
        </div>
      </>}
    >
      {note ? <p role="status" className={css.status}>{note}</p> : null}
      <div className={css.tw}>
        <table className={css.tbl}>
          <thead><tr><th scope="col" aria-label="Выбор" /><th scope="col">Клиент</th><th scope="col">Последний визит</th><th scope="col">Что брал</th><th scope="col">Использовано</th><th scope="col" className={css.num}>Всего оплачено</th><th scope="col">Следующая бронь</th><th scope="col" /></tr></thead>
          <tbody>
            {visible.map(row => {
              const on = picked.includes(row.id)
              return <tr key={row.id} data-sel={on || undefined} onClick={() => onOpen(row.id)}>
                <td onClick={event => event.stopPropagation()}>
                  <button type="button" role="checkbox" className={css.cb} aria-checked={on} aria-label={`Выбрать ${row.name}`} onClick={() => toggle(row.id)}>{on ? <ProtoIcon name="check" size={12} /> : null}</button>
                </td>
                <td>
                  <div className={css.who}>
                    <Avatar id={row.id} size={30} />
                    <span><button type="button" className={css.rowOpen} onClick={event => { event.stopPropagation(); onOpen(row.id) }}><b>{row.name}</b></button><small className={css.tn}>{row.phone || row.email || '—'}</small></span>
                  </div>
                </td>
                <td className={css.mono}>{row.lastKey ? `${row.lastDate}, ${row.lastTime}` : '—'}</td>
                <td>{row.kind.label ? <span className={css.tag} data-tone={row.kind.tone}>{row.kind.label}</span> : <span className={css.muted}>—</span>}</td>
                <td>{row.used
                  ? <><span className={css.bar}><i style={{ width: `${Math.round(row.used.done / Math.max(1, row.used.total) * 100)}%` }} /></span><span className={css.mono}>{row.used.done} из {row.used.total}</span></>
                  : <span className={css.muted}>—</span>}</td>
                <td className={css.num}>{formatMoney(row.paid)}</td>
                <td>{row.next ? <span className={css.mono}>{row.next.replace(' ', ', ')}</span> : <span className={css.muted}>не записан</span>}</td>
                <td onClick={event => event.stopPropagation()}>
                  <div className={css.ra}>
                    <button type="button" className={css.ib} aria-label={`Написать: ${row.name}`} onClick={onMessage}><ProtoIcon name="chat" size={15} /></button>
                    <button type="button" className={css.ib} aria-label={`Записать: ${row.name}`} onClick={onBook}><ProtoIcon name="calendar" size={15} /></button>
                    <button type="button" className={css.ib} aria-label={`Открыть карточку: ${row.name}`} onClick={() => onOpen(row.id)}><ProtoIcon name="more" size={15} /></button>
                  </div>
                </td>
              </tr>
            })}
          </tbody>
        </table>
        {!visible.length ? <p className={css.empty}>Никого не нашли.</p> : null}
      </div>
      <div className={css.foot}>
        <span>{picked.length
          ? <>{picked.length === 1 ? 'Выбран' : 'Выбрано'} {ruCount(picked.length, 'клиент', 'клиента', 'клиентов')}<span className={css.sep}>·</span><button type="button" className={css.lnk} onClick={onMessage}>Написать</button><span className={css.sep}>·</span><button type="button" className={css.lnk} onClick={onBook}>Записать</button></>
          : 'Нажмите на строку, чтобы открыть карточку'}</span>
        {pager}
      </div>
      <div className={css.cr3List}>
        {visible.map(row => <button key={row.id} type="button" className={css.cr3} onClick={() => onOpen(row.id)}>
          <Avatar id={row.id} size={30} />
          <span><b>{row.name}</b><small>{row.doing}</small></span>
          <span className={css.rr}>
            <b className={css.tn}>{row.paid > 0 ? formatMoney(row.paid) : '—'}</b>
            <span className={css.mono}>{row.lastKey ? row.lastDate : '—'}</span>
          </span>
        </button>)}
        {!visible.length ? <p className={css.empty}>Никого не нашли.</p> : null}
      </div>
      <div className={css.phoneFoot}>{pager}</div>
    </ListScreenShell>
  </div>
}

export type ClientCardMessage = DemoCardMessage

export function ClientCardView({ name, avatarId, phone, email, card, noun, thread, onBack, onWrite, onNewBooking, onOpenBooking, onOpenOrder, onSend, extraFields, onAddField, noShow, narrow }: {
  name: string
  avatarId: string
  phone: string
  email: string
  card: DemoCard
  noun: string
  thread: readonly DemoCardMessage[]
  extraFields: readonly string[]
  noShow?: string
  narrow?: boolean
  onBack: () => void
  onWrite: () => void
  onNewBooking: () => void
  onOpenOrder?: () => void
  onOpenBooking?: (index: number) => void
  onSend: (mode: 'client' | 'note', text: string) => void
  onAddField: (label: string) => void
}) {
  const [filter, setFilter] = useState<'all' | 'notes'>('all')
  const [mode, setMode] = useState<'client' | 'note'>('client')
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const messages = [...card.messages, ...thread].filter(message => filter === 'all' || message.kind === 'note')
  const send = () => {
    const value = text.trim()
    if (!value) return
    onSend(mode, value)
    setText('')
  }
  const { active } = card
  return <div className={css.root} data-prokat-root data-prokat-screen="client-card" data-narrow={narrow || undefined}>
    <div className={css.card}>
      <div className={css.top}>
        <nav className={css.crumb} aria-label="Хлебные крошки">
          <button type="button" onClick={onBack}><ProtoIcon name="back" size={14} />Клиенты</button>
          <i>/</i><span>{name}</span>
        </nav>
        <div className={css.ph}>
          <Avatar id={avatarId} size={60} />
          <div>
            <h1>{name}</h1>
            <div className={css.meta}>
              {phone ? <span className={css.tn}><ProtoIcon name="call" size={14} />{phone}</span> : null}
              {email ? <span><ProtoIcon name="mail" size={14} />{email}</span> : null}
              {card.since ? <span className={css.mono}>клиент с {card.since}</span> : null}
            </div>
          </div>
          <div className={css.acts}>
            {card.tags.map(tag => <span key={tag.label} className={css.tag} data-tone={tag.tone}>{tag.label}</span>)}
            <button type="button" className={css.ib} aria-label="Ещё" onClick={onOpenOrder}><ProtoIcon name="more" size={16} /></button>
            <button type="button" className={css.btn} data-o="" onClick={onWrite}><ProtoIcon name="chat" size={15} />Написать</button>
            <button type="button" className={css.btn} onClick={onNewBooking}><ProtoIcon name="plus" size={15} />Новая {noun}</button>
          </div>
        </div>
        <div className={css.kp4}>
          <div><small>Броней</small><b>{card.count}</b></div>
          <div><small>Средний чек</small><b>{formatMoney(card.average)}</b></div>
          <div><small>Оплачено всего</small><b>{formatMoney(card.paid)}</b></div>
          <div><small>Сейчас в прокате</small><b>{card.open}</b></div>
        </div>
      </div>
      <div className={css.cc}>
        <div className={css.cl}>
          <section aria-label="Активная бронь">
            <h3 className={css.h3}>Сейчас в прокате{active ? <span className={`${css.rt} ${css.mono}`}>{active.number}</span> : null}</h3>
            {active ? <div className={css.nb}>
              <div className={css.nh}>
                <span className={css.lgx} aria-hidden="true"><ProtoIcon name="box" size={18} /></span>
                <div><b>{active.title}</b><small>{active.sub}</small></div>
                <span className={css.pill} data-tone={active.status.tone}>{active.status.label}</span>
                <span className={css.amount}>{formatMoney(active.amount)}</span>
              </div>
              <ol className={css.stp} aria-label="Этапы брони">
                {active.steps.map(step => <li key={step.label} data-state={step.state} aria-current={step.state === 'cur' ? 'step' : undefined}><i /><b>{step.label}</b><span className={css.mono}>{step.date}</span></li>)}
              </ol>
              {onOpenOrder ? <button type="button" className={css.openLink} onClick={onOpenOrder}>Открыть бронь</button> : null}
            </div> : <p className={css.empty} style={{ padding: 0 }}>Открытых броней нет.</p>}
          </section>
          <section className={css.hist} aria-label="Прошлые брони">
            <h3 className={css.h3}>Прошлые брони<span className={css.rt}>{ruCount(card.past.length, 'бронь', 'брони', 'броней')}</span></h3>
            {card.past.length ? card.past.map((item, index) => <button key={`${item.date}-${index}`} type="button" className={css.r} onClick={() => onOpenBooking?.(index)}>
              <span className={css.mono}>{item.date}</span>
              <div><b>{item.title}</b><small>{item.sub}</small></div>
              <span><span className={css.pill} data-tone={item.status.tone}>{item.status.label}</span></span>
              <span className={css.num}>{formatMoney(item.amount)}</span>
            </button>) : <p className={css.empty} style={{ padding: 0 }}>Прошлых броней пока нет.</p>}
          </section>
          <section aria-label="Данные клиента">
            <h3 className={css.h3}>Данные клиента<span className={css.rt}>поля шаблона</span></h3>
            <div className={css.flds}>
              {card.fields.map(field => <div key={field.label} className={css.fl}><small>{field.label}</small><b className={field.mono ? css.mono : undefined} data-mono={field.mono || undefined}>{field.value}</b></div>)}
              {extraFields.map(label => <div key={label} className={css.fl}><small>{label}</small><b className={css.muted}>—</b></div>)}
              {adding
                ? <form className={css.addForm} onSubmit={event => { event.preventDefault(); const label = draft.trim(); if (label) onAddField(label); setDraft(''); setAdding(false) }}>
                  <input autoFocus aria-label="Название поля" placeholder="Название поля" maxLength={60} value={draft} onChange={event => setDraft(event.target.value)} />
                  <button type="submit" className={css.ib} aria-label="Добавить поле"><ProtoIcon name="check" size={14} /></button>
                </form>
                : <button type="button" className={css.fl} data-add="" onClick={() => setAdding(true)}><ProtoIcon name="plus" size={14} />Добавить поле</button>}
            </div>
            {noShow ? <p className={css.noShow}>{noShow}</p> : null}
          </section>
        </div>
        <aside className={css.cr2} aria-label="Переписка и заметки">
          <div className={css.crh}>
            <h3 className={css.h3}>Переписка и заметки</h3>
            <div className={css.seg} role="group" aria-label="Что показывать">
              <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Всё</button>
              <button type="button" aria-pressed={filter === 'notes'} onClick={() => setFilter('notes')}>Заметки</button>
            </div>
          </div>
          <div className={css.fd}>
            {messages.map(message => <div key={message.id} className={css.ms} data-kind={message.kind}>
              {message.head ? <span className={css.mono}>{message.head}</span> : null}{message.text}
            </div>)}
            {!messages.length ? <div className={css.ms} data-kind="sys">Пока ничего нет</div> : null}
          </div>
          <div className={css.cmp}>
            <textarea aria-label={mode === 'client' ? 'Сообщение клиенту' : 'Заметка'} placeholder="Ответить клиенту или оставить заметку…" value={text} maxLength={2000} onChange={event => setText(event.target.value)} />
            <div className={css.row}>
              <div className={css.seg} role="group" aria-label="Кому">
                <button type="button" aria-pressed={mode === 'client'} onClick={() => setMode('client')}>Клиенту</button>
                <button type="button" aria-pressed={mode === 'note'} onClick={() => setMode('note')}>Заметка</button>
              </div>
              <button type="button" className={`${css.btn} ${css.send}`} disabled={!text.trim()} onClick={send}>Отправить →</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
}
