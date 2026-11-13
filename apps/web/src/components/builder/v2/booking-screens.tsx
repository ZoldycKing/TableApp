'use client'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { dateInstant, instantToWallClock } from '@tableapp/schema'
import type { AppV2Record } from '@tableapp/schema/app-v2'
import { builderV2CatalogCell, builderV2CatalogPrice } from '@/lib/builder-v2-catalog'
import { bookingVisitSection } from '@/lib/booking-lifecycle'
import type { AppV2RendererProps } from './view'
import { usePublishedV2 } from './published-context'
import { ListScreenShell, DetailCardShell, DetailSection, ShellSearchField } from './layout-shell'
import { BuilderV2CatalogDetail } from './catalog-detail'
import { BuilderV2Picture } from './media'
import { builderV2MediaItems } from './media-values'
import { ProtoIcon } from '../prototype/icons'
import { useBookingCollection } from './booking-data'
import css from './booking.module.css'
import shell from './layout-shell.module.css'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'
import presentation from '@/components/runtime/app-presentation.module.css'
import { OrderActionPanelContext } from './order-detail'
import { BookingScheduleForm } from './booking-schedule'
import { BookingCalendarScreen } from './booking-calendar'
import { BookingPeopleScreen, BookingClientNextVisit } from './booking-people'
import { useBookingJourney } from './booking-journey'
import { builderV2ScreenNodes } from '@/lib/builder-v2-data-types'
import { RecordProfileActions } from './record-blocks'
const BookingLogin = lazy(async () => ({ default: (await import('@/components/runtime/app-login')).AppLogin }))

type Props = AppV2RendererProps & { renderNodes: (ids: readonly string[]) => ReactNode }
const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('ru-RU')} ₽` : 'Цена уточняется'
const label = (row: AppV2Record, id: string) => builderV2CatalogCell(row, id)

function Photo({ row, fieldId, person = false, large = false, name = '', className }: { row: AppV2Record; fieldId?: string; person?: boolean; large?: boolean; name?: string; className?: string }) {
  const published = usePublishedV2()
  const item = fieldId && builderV2MediaItems(row.values[fieldId], published?.slug).find(item => item.image)
  return <span className={className ?? (large ? css.profilePhoto : css.photo)} data-person={person || undefined} aria-hidden="true">{item ? <BuilderV2Picture item={item} /> : person && name ? name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('') : <ProtoIcon name={person ? 'user' : 'scissors'} size={large ? 32 : 48} />}</span>
}
function Status({ row, booking }: { row: AppV2Record; booking: NonNullable<Props['app']['booking']> }) {
  const value = row.values[booking.visit.status]
  const tone = Object.entries(booking.statuses).find(([, id]) => id === value)?.[0] ?? 'booked'
  return <span className={css.badge} data-tone={tone}>{label(row, booking.visit.status)}</span>
}
function Facts({ items }: { items: { name: string; value: ReactNode }[] }) {
  return <dl className={css.facts}>{items.filter(item => item.value).map(item => <div key={item.name}><dt>{item.name}</dt><dd>{item.value}</dd></div>)}</dl>
}

export function BookingScreen(props: Props) {
  const { app, record } = props, booking = app.booking!, published = usePublishedV2()
  const screen = app.screens.find(screen => screen.id === props.screenId)!
  const collection = app.nodes.find(node => screen.rootIds.includes(node.id) && node.type === 'collection')
  const node = collection?.type === 'collection' ? collection : undefined
  const [search, setSearch] = useState(''), [section, setSection] = useState('upcoming')
  const timeZone = props.tables.find(table => table.id === booking.tables.visits)?.fields.find(field => field.id === booking.visit.start)?.timeZone ?? 'Europe/Moscow'
  const [showForm, setShowForm] = useState(false), [showClient, setShowClient] = useState(false)
  const journey = useBookingJourney()
  const agenda = screen.id === booking.listScreenId
  const pageForm = app.nodes.find(node => screen.rootIds.includes(node.id) && node.type === 'form')
  const additional = screen.rootIds.filter(id => id !== node?.id && id !== pageForm?.id)
  const owner = props.actor.roleIds.includes('owner')
  const data = useBookingCollection(app, screen.id, node?.id, { search, rows: node && props.rows?.[node.sourceId], enabled: Boolean(props.live) && !agenda && screen.id !== booking.setupScreenId && !(owner && [booking.mastersScreenId, booking.customersScreenId].includes(screen.id) && node?.layout === 'list' && node.itemIds.length === 0) })
  const navigate = (id: string, rowId?: string) => { if (published) published.navigate(id, rowId); else props.onNavigate?.(id, rowId) }
  const back = (id: string) => { if (published) published.back(id); else props.onNavigate?.(id) }
  const feedback = <>
    {data.loading && <p role="status" className={css.empty}>Загружаем…</p>}
    {data.error && <div className={css.error} role="alert"><p>{data.error}</p><button className={styles.secondary} type="button" onClick={data.retry}>Повторить загрузку</button></div>}
    {data.more && <button className={styles.secondary} type="button" disabled={data.loadingMore} onClick={() => void data.loadMore()}>{data.loadingMore ? 'Загружаем…' : 'Показать ещё'}</button>}
  </>
  // Forms stay in the same app viewport, including the phone preview in the editor.
  if (showForm && pageForm) return <div className={css.formPage}><button type="button" className={styles.textButton} onClick={() => setShowForm(false)}>← Назад</button>{screen.id === booking.setupScreenId ? <BookingScheduleForm app={app} screenId={screen.id} formId={pageForm.id} editing={Boolean(props.editing)} onSaved={() => setShowForm(false)} /> : <OrderActionPanelContext value={{ mode: 'reveal', close: () => setShowForm(false) }}>{props.renderNodes([pageForm.id])}</OrderActionPanelContext>}</div>
  if (screen.id === booking.setupScreenId && pageForm) return <div className={css.formPage}><button type="button" className={styles.textButton} onClick={() => back(booking.listScreenId!)}>← Расписание</button><BookingScheduleForm app={app} screenId={screen.id} formId={pageForm.id} editing={Boolean(props.editing)} onSaved={() => back(booking.listScreenId!)}/></div>
  const profile = screen.id === booking.customerScreenId ? builderV2ScreenNodes(app, screen.id).find(node => node.type === 'profile') : undefined
  if (owner && profile && booking.clients) {
    const c = booking.clients
    const actions = <><button type="button" className={styles.primary} disabled={props.editing || !record} onClick={() => { if (!record) return; journey?.setIntent({ clientId: record.id, client: String(record.values[c.name] ?? ''), phone: String(record.values[c.phone] ?? ''), email: String(record.values[c.email] ?? '') }); navigate(booking.catalogScreenId) }}><ProtoIcon name="plus"/>Записать клиента</button>{pageForm && <button type="button" className={styles.secondary} onClick={() => setShowForm(true)}>Изменить клиента</button>}</>
    return <div className={css.configuredProfile} data-booking-client-profile><button type="button" className={styles.textButton} onClick={() => back(booking.customersScreenId!)}><ProtoIcon name="back"/>Клиенты</button>{record && <BookingClientNextVisit app={app} screenId={screen.id} clientId={record.id} onOpen={id => navigate(booking.visitScreenId,id)}/>}<RecordProfileActions value={{ nodeId: profile.id, actions }}>{props.renderNodes(screen.rootIds.filter(id => id !== pageForm?.id))}</RecordProfileActions></div>
  }
  // Changing a starter collection to another layout or custom item blocks uses
  // the regular component renderer, including its configured actions.
  if (node && (node.itemIds.length > 0 || screen.id === booking.catalogScreenId && node.layout !== 'catalog' || [booking.mastersScreenId, booking.customersScreenId].includes(screen.id) && node.layout !== 'list' || agenda && node.layout !== 'calendar')) return <div className={css.page}>{props.renderNodes(screen.rootIds)}</div>
  if (owner && (screen.id === booking.mastersScreenId || screen.id === booking.masterScreenId || screen.id === booking.customersScreenId || screen.id === booking.customerScreenId || showClient && screen.id === booking.visitScreenId)) return <div className={css.page}><BookingPeopleScreen app={app} screenId={screen.id} initialMasterId={screen.id === booking.masterScreenId ? record?.id : undefined} initialClientVisitId={showClient ? record?.id : undefined} initialClientId={screen.id === booking.customerScreenId ? record?.id : undefined} onNavigate={navigate} onClose={screen.id === booking.customerScreenId ? () => back(booking.customersScreenId!) : showClient ? () => setShowClient(false) : screen.id === booking.masterScreenId ? () => back(booking.mastersScreenId) : undefined} onAddClient={screen.id === booking.customersScreenId && pageForm ? () => setShowForm(true) : undefined} onEditClient={screen.id === booking.customerScreenId && pageForm ? () => setShowForm(true) : undefined} onAddMaster={screen.id === booking.mastersScreenId && pageForm ? () => setShowForm(true) : undefined} onEditMaster={screen.id === booking.masterScreenId && pageForm ? () => setShowForm(true) : undefined} />{!showClient && props.renderNodes(additional)}</div>
  if (screen.id === booking.catalogScreenId || screen.id === booking.mastersScreenId) {
    const masters = screen.id === booking.mastersScreenId
    const rows = data.rows.filter(row => row.values[masters ? booking.master.active : booking.service.active] === true)
    const table = props.tables.find(table => table.id === (masters ? booking.tables.masters : booking.tables.services))
    const titleField = node?.titleFieldId ?? (masters ? booking.master.name : booking.service.name)
    const cards = rows.map(row => <button type="button" key={row.id} className={masters ? css.card : `${presentation.catalogCard} flex flex-col text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sage-600`} onClick={() => navigate(masters ? booking.masterScreenId : booking.serviceScreenId, row.id)}>
      <Photo row={row} person={masters} name={label(row, titleField)} className={masters ? undefined : presentation.photo} fieldId={masters ? booking.masterPhotoFieldId : node?.cardImageFieldId ?? booking.servicePhotoFieldId} />
      {masters ? <span className={css.cardCopy}><strong>{label(row, titleField)}</strong>
        <span className={css.duration}>{label(row, booking.masterDescriptionFieldId!) || 'Поможет подобрать подходящую услугу'}</span>
        <span className={css.cardAction}>О мастере<ProtoIcon name="arrow" size={16} /></span>
      </span> : <span className="flex flex-1 flex-col gap-1 p-3.5">
        <span className="line-clamp-2 text-sm font-semibold leading-snug">{label(row, titleField)}</span>
        <span className={css.duration}>{label(row, booking.service.minutes)} мин</span>
        <span className="mt-auto flex justify-end pt-3 text-[15px] font-bold tabular-nums">{builderV2CatalogPrice(row, table?.fields.find(field => field.id === (node?.cardDetailFieldId ?? booking.service.price)))}</span>
      </span>}
    </button>)
    return <div className={css.page}>{!masters && journey?.intent && <div className={css.bookingIntent}><span><strong>{journey.intent.client ? `Запись клиента: ${journey.intent.client}` : 'Новая запись'}</strong><small>{journey.intent.day ? `${journey.intent.day.split('-').reverse().join('.')} · ${journey.intent.time ?? ''}. ` : ''}Выберите услугу — затем подтвердите время.</small></span><button type="button" className={styles.textButton} onClick={() => journey.setIntent(null)}>Сбросить выбор</button></div>}<ListScreenShell title={screen.name} meta={masters ? 'Выберите своего мастера' : 'Выберите услугу и удобное время'} actions={owner && pageForm ? <button type="button" className={styles.primary} onClick={() => setShowForm(true)}><ProtoIcon name="plus" />{masters ? 'Добавить мастера' : 'Добавить услугу'}</button> : undefined} search={<ShellSearchField value={search} onChange={setSearch} placeholder={masters ? 'Найти мастера' : 'Найти услугу'} />}>
      <div className={masters ? css.cards : `${css.serviceCards} ${presentation.catalog}`} data-booking-catalog data-masters={masters || undefined} onClickCapture={() => { if (props.editing && node) props.onSelect?.(node.id) }}>{masters ? cards : <div className={presentation.catalogGrid}>{cards}</div>}</div>
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
      </div><aside className={shell.detailSideCol}><DetailSection title={client ? 'Контактные данные' : 'О клиенте'}><Facts items={[{ name: 'Клиент', value: label(record, booking.visit.client) }, { name: 'Телефон', value: <a href={`tel:${String(record.values[booking.visit.phone] ?? '').replace(/[^+\d]/g, '')}`}>{label(record, booking.visit.phone)}</a> }]} />{owner && !props.editing && <button type="button" className={styles.textButton} onClick={() => setShowClient(true)}>Профиль и история клиента<ProtoIcon name="arrow" size={16} /></button>}</DetailSection></aside></div>
    </DetailCardShell></div>
  }
  if (agenda) {
    const hoursScreen = app.screens.find(item => item.id === booking.setupScreenId)
    const hoursForm = hoursScreen && app.nodes.find(item => item.type === 'form' && hoursScreen.rootIds.includes(item.id))
    return <div className={css.page} onClickCapture={() => { if (props.editing && node) props.onSelect?.(node.id) }}><BookingCalendarScreen app={app} screenId={screen.id} timeZone={timeZone} editing={Boolean(props.editing)} onOpenVisit={id => navigate(booking.visitScreenId,id)} onOpenPeriod={owner && booking.periodScreenId ? id => navigate(booking.periodScreenId!,id) : undefined} onConfigure={owner && hoursForm ? () => navigate(booking.setupScreenId) : undefined} onCreate={owner ? intent => { journey?.setIntent(intent); navigate(booking.catalogScreenId) } : undefined} onAdd={owner ? () => { journey?.setIntent({}); navigate(booking.catalogScreenId) } : undefined}/>{props.renderNodes(additional)}</div>
  }
  if (screen.id === booking.clientScreenId) {
    const rows = data.rows.filter(row => bookingVisitSection(booking, { id: row.id, data: { ...row.values } }, timeZone, Date.now()) === section).sort((a, b) => (dateInstant(a.values[booking.visit.start], timeZone) ?? 0) - (dateInstant(b.values[booking.visit.start], timeZone) ?? 0))
    return <div className={css.page}><ListScreenShell title={screen.name} meta="Предстоящие визиты и история" actions={<button type="button" className={styles.primary} onClick={() => navigate(booking.catalogScreenId)}>Выбрать услугу<ProtoIcon name="plus" /></button>} tabs={[{ id: 'upcoming', label: 'Предстоящие' }, { id: 'history', label: 'История' }]} activeTab={section} onTabChange={setSection}>
      <div className={css.visits + ' ' + css.listBody}>{rows.map(row => {
        const time = instantToWallClock(String(row.values[booking.visit.start]), timeZone)
        return <button type="button" className={css.visit} key={row.id} onClick={() => navigate(booking.visitScreenId, row.id)}><span className={css.visitTime}>{time?.time}<small>{time ? new Date(time.date + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''}</small></span><span className={css.visitCopy}><strong>{label(row, booking.visit.service)}</strong><span>{label(row, booking.visit.master)}</span></span><span className={css.visitAside}><strong>{money(row.values[booking.visit.price])}</strong><Status row={row} booking={booking} /></span></button>
      })}{!data.loading && !data.error && !rows.length && <p className={css.empty}>{section === 'upcoming' ? 'Предстоящих записей пока нет. Выберите услугу и удобное время.' : 'Здесь будут ваши прошедшие и отменённые визиты.'}</p>}</div>{feedback}
    </ListScreenShell>{props.renderNodes(additional)}</div>
  }
  if (screen.id === booking.periodScreenId && pageForm) return <div className={css.formPage}><button type="button" className={styles.textButton} onClick={() => back(booking.listScreenId!)}>← Расписание</button><BookingScheduleForm app={app} screenId={screen.id} formId={pageForm.id} recordId={record?.id} editing={Boolean(props.editing)} onSaved={() => back(booking.listScreenId!)} /></div>
  return <div className={css.page}><div className={css.formPage}><button type="button" className={styles.textButton} onClick={() => back(booking.listScreenId!)}>← Расписание</button>{props.renderNodes(screen.rootIds)}</div></div>
}
