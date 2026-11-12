'use client'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { calendarDay, dateInstant, instantToWallClock } from '@tableapp/schema'
import type { AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2DataRecord } from '@/lib/builder-v2-data-types'
import { builderV2CatalogCell, builderV2CatalogPrice } from '@/lib/builder-v2-catalog'
import { bookingVisitSection } from '@/lib/booking-lifecycle'
import { oneRelation } from '@/lib/booking'
import type { AppV2RendererProps } from './view'
import { usePublishedV2 } from './published-context'
import { ListScreenShell, DetailCardShell, DetailSection, ShellSearchField } from './layout-shell'
import { BuilderV2CatalogDetail } from './catalog-detail'
import { BuilderV2Picture } from './media'
import { builderV2MediaItems } from './media-values'
import { ProtoIcon } from '../prototype/icons'
import { bookingDays, useBookingCollection } from './booking-data'
import css from './booking.module.css'
import shell from './layout-shell.module.css'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'
import { OrderActionPanelContext } from './order-detail'
import { BookingScheduleForm } from './booking-schedule'
const BookingLogin = lazy(async () => ({ default: (await import('@/components/runtime/app-login')).AppLogin }))

type Props = AppV2RendererProps & { renderNodes: (ids: readonly string[]) => ReactNode }
const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('ru-RU')} ₽` : 'Цена уточняется'
const label = (row: AppV2Record, id: string) => builderV2CatalogCell(row, id)

function Photo({ row, fieldId, person = false, large = false, name = '' }: { row: AppV2Record; fieldId?: string; person?: boolean; large?: boolean; name?: string }) {
  const published = usePublishedV2()
  const item = fieldId && builderV2MediaItems(row.values[fieldId], published?.slug).find(item => item.image)
  return <span className={large ? css.profilePhoto : css.photo} data-person={person || undefined} aria-hidden="true">{item ? <BuilderV2Picture item={item} /> : person && name ? name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('') : <ProtoIcon name={person ? 'user' : 'scissors'} size={large ? 32 : 48} />}</span>
}
function Status({ row, booking }: { row: AppV2Record; booking: NonNullable<Props['app']['booking']> }) {
  const value = row.values[booking.visit.status]
  const tone = Object.entries(booking.statuses).find(([, id]) => id === value)?.[0] ?? 'booked'
  return <span className={css.badge} data-tone={tone}>{label(row, booking.visit.status)}</span>
}
function scheduleDay(row: AppV2Record, booking: NonNullable<Props['app']['booking']>) {
  const date = calendarDay(row.values[booking.schedule.date])
  return date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : label(row, booking.schedule.weekday)
}
function Facts({ items }: { items: { name: string; value: ReactNode }[] }) {
  return <dl className={css.facts}>{items.filter(item => item.value).map(item => <div key={item.name}><dt>{item.name}</dt><dd>{item.value}</dd></div>)}</dl>
}

export function BookingScreen(props: Props) {
  const { app, record } = props, booking = app.booking!, published = usePublishedV2()
  const screen = app.screens.find(screen => screen.id === props.screenId)!
  const collection = app.nodes.find(node => screen.rootIds.includes(node.id) && node.type === 'collection')
  const node = collection?.type === 'collection' ? collection : undefined
  const [search, setSearch] = useState(''), [week, setWeek] = useState(false), [section, setSection] = useState('upcoming'), [master, setMaster] = useState('')
  const timeZone = props.tables.find(table => table.id === booking.tables.visits)?.fields.find(field => field.id === booking.visit.start)?.timeZone ?? 'Europe/Moscow'
  const today = instantToWallClock(new Date(), timeZone)!.date
  const [day, setDay] = useState(today)
  const [showForm, setShowForm] = useState(false)
  const agenda = screen.id === booking.listScreenId
  const days = agenda ? bookingDays(day, week) : undefined
  const pageForm = app.nodes.find(node => screen.rootIds.includes(node.id) && node.type === 'form')
  const additional = screen.rootIds.filter(id => id !== node?.id && id !== pageForm?.id)
  const owner = props.actor.roleIds.includes('owner')
  const data = useBookingCollection(app, screen.id, node?.id, { search, days, rows: node && props.rows?.[node.sourceId], enabled: Boolean(props.live) })
  const navigate = (id: string, rowId?: string) => { if (published) published.navigate(id, rowId); else props.onNavigate?.(id, rowId) }
  const back = (id: string) => { if (published) published.back(id); else props.onNavigate?.(id) }
  const feedback = <>
    {data.loading && <p role="status" className={css.empty}>Загружаем…</p>}
    {data.error && <div className={css.error} role="alert"><p>{data.error}</p><button className={styles.secondary} type="button" onClick={data.retry}>Повторить загрузку</button></div>}
    {data.more && <button className={styles.secondary} type="button" disabled={data.loadingMore} onClick={() => void data.loadMore()}>{data.loadingMore ? 'Загружаем…' : 'Показать ещё'}</button>}
  </>
  // Forms stay in the same app viewport, including the phone preview in the editor.
  if (showForm && pageForm) return <div className={css.formPage}><button type="button" className={styles.textButton} onClick={() => setShowForm(false)}>← Назад</button>{screen.id === booking.setupScreenId ? <BookingScheduleForm app={app} screenId={screen.id} formId={pageForm.id} editing={Boolean(props.editing)} onSaved={() => setShowForm(false)} /> : <OrderActionPanelContext value={{ mode: 'reveal', close: () => setShowForm(false) }}>{props.renderNodes([pageForm.id])}</OrderActionPanelContext>}</div>
  // Changing a starter collection to another layout or custom item blocks uses
  // the regular component renderer, including its configured actions.
  if (node && (node.itemIds.length > 0 || screen.id === booking.catalogScreenId && node.layout !== 'catalog' || screen.id === booking.mastersScreenId && node.layout !== 'list' || agenda && node.layout !== 'calendar')) return <div className={css.page}>{props.renderNodes(screen.rootIds)}</div>
  if (screen.id === booking.catalogScreenId || screen.id === booking.mastersScreenId) {
    const masters = screen.id === booking.mastersScreenId
    const rows = data.rows.filter(row => row.values[masters ? booking.master.active : booking.service.active] === true)
    const table = props.tables.find(table => table.id === (masters ? booking.tables.masters : booking.tables.services))
    const titleField = node?.titleFieldId ?? (masters ? booking.master.name : booking.service.name)
    return <div className={css.page}><ListScreenShell title={screen.name} meta={masters ? 'Выберите своего мастера' : 'Выберите услугу и удобное время'} actions={owner && pageForm ? <button type="button" className={styles.primary} onClick={() => setShowForm(true)}><ProtoIcon name="plus" />{masters ? 'Добавить мастера' : 'Добавить услугу'}</button> : undefined} search={<ShellSearchField value={search} onChange={setSearch} placeholder={masters ? 'Найти мастера' : 'Найти услугу'} />}>
      <div className={css.cards} data-booking-catalog data-masters={masters || undefined} onClickCapture={() => { if (props.editing && node) props.onSelect?.(node.id) }}>
        {rows.map(row => <button type="button" key={row.id} className={css.card} onClick={() => navigate(masters ? booking.masterScreenId : booking.serviceScreenId, row.id)}>
          <Photo row={row} person={masters} name={label(row, titleField)} fieldId={masters ? booking.masterPhotoFieldId : node?.cardImageFieldId ?? booking.servicePhotoFieldId} />
          <span className={css.cardCopy}><strong>{label(row, titleField)}</strong>
            <span className={css.duration}>{masters ? label(row, booking.masterDescriptionFieldId!) || 'Поможет подобрать подходящую услугу' : `${label(row, booking.service.minutes)} мин`}</span>
            {!masters && <span className={css.cardBottom}><span className={css.price}>{builderV2CatalogPrice(row, table?.fields.find(field => field.id === (node?.cardDetailFieldId ?? booking.service.price)))}</span></span>}
            <span className={css.cardAction}>{masters ? 'О мастере' : 'Подробнее'}<ProtoIcon name="arrow" size={16} /></span>
          </span>
        </button>)}
      </div>
      {!data.loading && !data.error && !rows.length && <p className={css.empty}>{search ? 'Ничего не нашли. Попробуйте другое название.' : masters ? 'Мастера появятся здесь после настройки расписания.' : 'Услуги появятся здесь после добавления в таблицу.'}</p>}
      {feedback}
    </ListScreenShell>{props.renderNodes(additional)}</div>
  }
  if (screen.id === booking.serviceScreenId && record) {
    const table = props.tables.find(table => table.id === booking.tables.services)
    return <div className={`${css.page} ${ui.catalogPage}`}><BuilderV2CatalogDetail catalog={screen.catalog ?? { titleFieldId: booking.service.name, imageFieldId: booking.servicePhotoFieldId, priceFieldId: booking.service.price, descriptionFieldId: booking.serviceDescriptionFieldId }} table={table} record={record} slug={published?.slug} editing={Boolean(props.editing)} onBack={() => back(booking.catalogScreenId)} actions={<div className={css.actions}><button type="button" className={styles.primary} disabled={record.values[booking.service.active] !== true} onClick={() => navigate(booking.formScreenId, record.id)}>Записаться<ProtoIcon name="arrow" /></button>{owner && pageForm && <button type="button" className={styles.secondary} onClick={() => setShowForm(true)}>Изменить услугу</button>}</div>}>
      <p className={css.duration}>Продолжительность · {label(record, booking.service.minutes)} мин</p>
      {props.renderNodes(additional)}
    </BuilderV2CatalogDetail></div>
  }
  if (screen.id === booking.masterScreenId && record) return <div className={css.page}><DetailCardShell title={label(record, booking.master.name)} subtitle="Мастер студии" media={<Photo row={record} fieldId={booking.masterPhotoFieldId} name={label(record, booking.master.name)} person large />} back={{ label: 'Мастера', onClick: () => back(booking.mastersScreenId) }} actions={<div className={css.actions}><button type="button" className={styles.primary} onClick={() => navigate(booking.catalogScreenId)}>Выбрать услугу</button>{owner && pageForm && <button type="button" className={styles.secondary} onClick={() => setShowForm(true)}>Изменить мастера</button>}</div>}>
    <DetailSection title="О мастере"><p className={css.bodyCopy}>{label(record, booking.masterDescriptionFieldId!) || 'Выберите услугу, чтобы посмотреть свободное время этого мастера.'}</p></DetailSection>
    <DetailSection title="Услуги"><p className={css.bodyCopy}>{label(record, booking.master.services)}</p></DetailSection>
    {props.renderNodes(additional)}
  </DetailCardShell></div>
  if ([booking.formScreenId, booking.rescheduleScreenId].includes(screen.id)) {
    const reschedule = screen.id === booking.rescheduleScreenId
    const goBack = () => reschedule && record ? navigate(booking.visitScreenId, record.id) : record ? navigate(booking.serviceScreenId, record.id) : back(booking.catalogScreenId)
    return <div className={css.page}><div className={css.formPage}>
      <button type="button" className={styles.textButton} onClick={goBack}>← {reschedule ? 'К записи' : 'К услуге'}</button>
      <h2>{reschedule ? 'Перенести запись' : record ? label(record, booking.service.name) : 'Записаться на услугу'}</h2>
      {!reschedule && record && <p className={css.duration}>{label(record, booking.service.minutes)} мин · {money(record.values[booking.service.price])}</p>}
      {!props.actor.authenticated ? <DetailSection title="Подтвердите почту для записи"><p className={css.bodyCopy}>Так вы сможете посмотреть, перенести или отменить свой визит.</p><Suspense fallback={<p role="status">Подготавливаем вход…</p>}><BookingLogin slug={app.slug} appName={app.name} accent={app.theme.accent} initialError={null} embedded purpose="app" onDone={() => published?.refresh()} /></Suspense></DetailSection> : props.renderNodes(screen.rootIds)}
    </div></div>
  }
  if (screen.id === booking.visitScreenId && record) {
    const start = typeof record.values[booking.visit.start] === 'string' ? String(record.values[booking.visit.start]) : ''
    const date = dateInstant(start, timeZone)
    const upcoming = record.values[booking.visit.status] === booking.statuses.booked && date !== null && date > Date.now()
    const client = !props.actor.roleIds.includes('owner') && !props.actor.roleIds.includes('staff')
    const title = label(record, booking.visit.service)
    const actions = <div className={css.actions}>{upcoming && !props.actor.roleIds.includes('staff') && <button type="button" className={styles.secondary} onClick={() => navigate(booking.rescheduleScreenId, record.id)}>Перенести</button>}{upcoming && props.renderNodes([booking.cancelButtonId])}</div>
    const returnId = client ? booking.clientScreenId : booking.listScreenId!
    return <div className={css.page}><DetailCardShell title={title} badge={<Status row={record} booking={booking} />} subtitle={date === null ? '' : new Date(date).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone })} back={{ label: client ? 'Мои записи' : 'Расписание', onClick: () => back(returnId) }} actions={actions} metrics={[{ key: 'price', caption: 'Стоимость визита', value: money(record.values[booking.visit.price]) }, { key: 'duration', caption: 'Продолжительность', value: `${label(record, booking.visit.minutes)} мин` }]}>
      <div className={css.visitColumns}><div className={shell.detailMainCol}><DetailSection title="Ваш визит"><Facts items={[{ name: 'Услуга', value: title }, { name: 'Мастер', value: label(record, booking.visit.master) }]} /></DetailSection>
        {!client && props.renderNodes([booking.statusFormId])}
      </div><aside className={shell.detailSideCol}><DetailSection title={client ? 'Контактные данные' : 'О клиенте'}><Facts items={[{ name: 'Клиент', value: label(record, booking.visit.client) }, { name: 'Телефон', value: <a href={`tel:${String(record.values[booking.visit.phone] ?? '').replace(/[^+\d]/g, '')}`}>{label(record, booking.visit.phone)}</a> }]} /></DetailSection></aside></div>
    </DetailCardShell></div>
  }
  if (agenda || screen.id === booking.clientScreenId) {
    const rows = data.rows.filter(row => {
      const instant = dateInstant(row.values[booking.visit.start], timeZone)
      const visitDay = instant === null ? '' : instantToWallClock(new Date(instant), timeZone)!.date
      return (!agenda || days!.includes(visitDay)) && (!master || oneRelation(row.values[booking.visit.master]) === master) && (agenda || bookingVisitSection(booking, { id: row.id, data: { ...row.values } }, timeZone, Date.now()) === section)
    }).sort((a, b) => (dateInstant(a.values[booking.visit.start], timeZone) ?? 0) - (dateInstant(b.values[booking.visit.start], timeZone) ?? 0))
    const masters = [...new Map(data.rows.map(row => [oneRelation(row.values[booking.visit.master]), label(row, booking.visit.master)])).entries()].filter(([id]) => id)
    const renderVisit = (row: AppV2Record) => {
      const time = instantToWallClock(String(row.values[booking.visit.start]), timeZone)
      return <button type="button" className={css.visit} key={row.id} onClick={() => navigate(booking.visitScreenId, row.id)}><span className={css.visitTime}>{time?.time}<small>{time ? new Date(`${time.date}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''}</small></span><span className={css.visitCopy}><strong>{label(row, booking.visit.service)}</strong><span>{agenda ? `${label(row, booking.visit.client)} · ` : ''}{label(row, booking.visit.master)}</span></span><span className={css.visitAside}><strong>{money(row.values[booking.visit.price])}</strong><Status row={row} booking={booking} /></span></button>
    }
    const partial = data.more
    return <div className={`${css.page} ${agenda ? css.agendaPage : ''}`}><ListScreenShell title={screen.name} meta={agenda ? 'Записи и занятость мастеров' : 'Предстоящие визиты и история'} actions={!props.actor.roleIds.includes('staff') ? <button type="button" className={styles.primary} onClick={() => navigate(booking.catalogScreenId)}>{agenda ? 'Добавить запись' : 'Выбрать услугу'}<ProtoIcon name="plus" /></button> : undefined}
      metrics={agenda && !data.loading && !data.error ? [{ key: 'visits', caption: week ? 'Записей за неделю' : 'Записей за день', value: master ? rows.length : data.total, note: partial ? 'Полный список доступен ниже' : undefined }, { key: 'amount', caption: 'Стоимость записей', value: money(rows.filter(row => ![booking.statuses.cancelled, booking.statuses.noShow].includes(String(row.values[booking.visit.status]))).reduce((sum, row) => sum + Number(row.values[booking.visit.price] ?? 0), 0)), note: partial ? 'По загруженным записям' : 'Без отмен и неявок' }, { key: 'noShow', caption: 'Неявок', value: rows.filter(row => row.values[booking.visit.status] === booking.statuses.noShow).length, note: partial ? 'По загруженным записям' : undefined }] : undefined}
      compactMetrics={agenda} tabs={!agenda ? [{ id: 'upcoming', label: 'Предстоящие' }, { id: 'history', label: 'История' }] : undefined} activeTab={section} onTabChange={setSection}
      search={agenda ? <div className={css.tools}><div className={`${css.switch} ${css.agendaSwitch}`}><button type="button" aria-pressed={!week} onClick={() => setWeek(false)}>День</button><button type="button" aria-pressed={week} onClick={() => setWeek(true)}>Неделя</button></div><label className={css.agendaDate}>Дата<input aria-label="Дата расписания" type="date" value={day} onChange={event => { if (event.target.value) { setDay(event.target.value); setMaster('') } }} /></label><button type="button" className={`${styles.secondary} ${css.agendaToday}`} onClick={() => setDay(today)}>Сегодня</button><label className={css.agendaMaster}>Мастер<select aria-label="Мастер расписания" value={master} onChange={event => setMaster(event.target.value)}><option value="">Все мастера</option>{masters.map(([id, name]) => <option key={id} value={id!}>{name}</option>)}</select></label></div> : undefined}>
      {agenda ? <div className={css.agenda}>{!data.loading && !data.error && days!.map(date => <section className={css.agendaDay} key={date}><h3>{new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</h3><div className={css.visits}>{rows.filter(row => instantToWallClock(String(row.values[booking.visit.start]), timeZone)?.date === date).map(renderVisit)}</div>{!rows.some(row => instantToWallClock(String(row.values[booking.visit.start]), timeZone)?.date === date) && <p className={css.empty}>Записей на этот день нет.</p>}</section>)}</div> : <div className={`${css.visits} ${css.listBody}`}>{rows.map(renderVisit)}{!data.loading && !data.error && !rows.length && <p className={css.empty}>{section === 'upcoming' ? 'Предстоящих записей пока нет. Выберите услугу и удобное время.' : 'Здесь будут ваши прошедшие и отменённые визиты.'}</p>}</div>}
      {feedback}
    </ListScreenShell>{props.renderNodes(additional)}</div>
  }
  if (screen.id === booking.setupScreenId) return <div className={css.page}><ListScreenShell title="Рабочее время" meta="Периоды работы, перерывы и выходные мастеров" actions={pageForm && <button type="button" className={styles.primary} onClick={() => setShowForm(true)}>Добавить рабочее время</button>} search={<ShellSearchField value={search} onChange={setSearch} placeholder="Найти мастера или период" />}>
    <div className={`${css.visits} ${css.listBody}`}>{data.rows.map(row => <button type="button" key={row.id} className={css.visit} onClick={() => booking.periodScreenId && navigate(booking.periodScreenId, row.id)}><span className={css.visitTime}><ProtoIcon name={row.values[booking.schedule.closed] ? 'calendar' : 'clock'} size={24} /></span><span className={css.visitCopy}><strong>{label(row, booking.schedule.master)}</strong><span>{scheduleDay(row, booking)}</span></span><span className={css.visitAside}>{row.values[booking.schedule.closed] ? 'Выходной' : `${label(row, booking.schedule.start)} — ${label(row, booking.schedule.end)}`}</span></button>)}</div>{feedback}
  </ListScreenShell>{props.renderNodes(additional)}</div>
  if (screen.id === booking.periodScreenId && pageForm) return <div className={css.formPage}><button type="button" className={styles.textButton} onClick={() => back(booking.setupScreenId)}>← Рабочее время</button><BookingScheduleForm app={app} screenId={screen.id} formId={pageForm.id} recordId={record?.id} editing={Boolean(props.editing)} onSaved={() => back(booking.setupScreenId)} /></div>
  return <div className={css.page}><div className={css.formPage}><button type="button" className={styles.textButton} onClick={() => back(booking.setupScreenId)}>← Рабочее время</button>{props.renderNodes(screen.rootIds)}</div></div>
}
