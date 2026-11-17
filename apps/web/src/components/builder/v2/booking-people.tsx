'use client'
import { useState } from 'react'
import { instantToWallClock } from '@tableapp/schema'
import type { AppV2 } from '@tableapp/schema/app-v2'
import type { BookingPersonVisit } from '@/lib/builder-v2-booking-people'
import { bookingCalendarShift, bookingClock } from '@/lib/builder-v2-booking-calendar'
import { ListScreenShell, ShellSearchField } from './layout-shell'
import { ProtoIcon } from '../prototype/icons'
import { BookingAvatar } from './booking-avatar'
import { bookingCalendarStatusNames, bookingCountLabel } from './booking-calendar-views'
import { useBookingJourney } from './booking-journey'
import { useBookingPeople } from './booking-people-data'
import css from './booking-people.module.css'
import styles from '../prototype/prototype.module.css'
import { RecordHistoryItem } from './record-blocks'
import { ruNumericDate } from './ru-fields'
import { builderV2MessengerLinks } from '@/lib/builder-v2-messengers'
import { clientVisitSummary, masterMonthSummary } from '@/lib/salon-people-summary'
import { BuilderV2OrderFacts } from './order-detail'
import type { BookingClient, BookingTeamSnapshot } from '@/lib/builder-v2-booking-people'

const money = (amount: number | null) => amount === null ? 'Цена не указана' : `${amount.toLocaleString('ru-RU')} ₽`
const rub = (amount: number) => `${amount.toLocaleString('ru-RU')} ₽`
const when = (start: string, timeZone: string, date = false) => {
  const value = new Date(start)
  const time = value.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone })
  if (!date) return time
  return `${ruNumericDate(value, timeZone)}, ${time}`
}
const dayLabel = (start: string, timeZone: string) => ruNumericDate(new Date(start), timeZone)
const future = (visit: BookingPersonVisit) => visit.status === 'booked' && Date.parse(visit.start) > Date.now()

function ClientProfileView({
  client, data, backLabel, onBack, onOpenVisit, onBook, onEdit,
}: {
  client: BookingClient
  data: BookingTeamSnapshot
  backLabel: string
  onBack: () => void
  onOpenVisit: (id: string) => void
  onBook: () => void
  onEdit?: () => void
}) {
  const [profileTab, setProfileTab] = useState('history')
  const visits = data.visits.filter(visit => visit.clientId === client.id)
  const summary = clientVisitSummary(visits)
  const notes = [...visits].reverse().filter(visit => visit.note.trim())
  const next = summary.next ? visits.find(visit => visit.start === summary.next!.start && visit.status === 'booked') : undefined
  const masterName = (id: string) => data.masters.find(master => master.id === id)?.name ?? 'Мастер'
  const messengers = builderV2MessengerLinks({
    telegram: client.telegram, whatsapp: client.whatsapp, max: client.max,
    otherLabel: client.otherMessengerLabel, otherValue: client.otherMessengerValue,
  })
  return <div className={css.clientPage} data-booking-client-profile>
    <button type="button" className={styles.textButton} onClick={onBack}><ProtoIcon name="back" />{backLabel}</button>
    <header className={css.clientHero}>
      <div className={css.clientIdentity}>
        <BookingAvatar name={client.name} photo={client.photo} />
        <div>
          <h2>{client.name}</h2>
          {client.phone ? <a href={`tel:${client.phone.replace(/[^\d+]/g, '')}`}>{client.phone}</a> : <p>Телефон не указан</p>}
          {client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : <p>Почта не указана</p>}
        </div>
      </div>
      <dl className={css.metrics}>
        <div><dd>{summary.visits}</dd><dt>Визиты</dt></div>
        <div><dd>{rub(summary.revenue)}</dd><dt>Сумма за всё время</dt></div>
        <div><dd>{summary.lastVisit ? dayLabel(summary.lastVisit, data.timeZone) : 'Ещё не было'}</dd><dt>Последний визит</dt></div>
      </dl>
      <div className={css.actions}>
        <button type="button" className={styles.primary} onClick={onBook}><ProtoIcon name="plus" />Записать</button>
        {onEdit && <button type="button" className={styles.textButton} onClick={onEdit}>Изменить</button>}
      </div>
    </header>
    {next && <button type="button" className={css.nextVisit} onClick={() => onOpenVisit(next.id)}><ProtoIcon name="calendar" /><span><strong>Следующая запись: {when(next.start, data.timeZone, true)}, {masterName(next.masterId)}</strong><small>{next.service}</small></span><ProtoIcon name="arrow" size={16} /></button>}
    <div className={css.clientColumns}>
      <section className={css.clientMain}>
        <div className={css.profileTabs} role="group" aria-label="Раздел карточки клиента">
          <button type="button" aria-pressed={profileTab === 'history'} onClick={() => setProfileTab('history')}>История визитов</button>
          <button type="button" aria-pressed={profileTab === 'notes'} onClick={() => setProfileTab('notes')}>Предпочтения и заметки</button>
        </div>
        {profileTab === 'history' ? visits.length ? <Visits visits={[...visits].reverse()} timeZone={data.timeZone} masters={data.masters} onOpen={onOpenVisit} /> : <p className={css.feedback}>Визитов пока нет. Нажмите «Записать», чтобы выбрать услугу и время.</p> : <div className={css.notes}>{client.note && <article><h3>Предпочтения</h3><p>{client.note}</p></article>}{notes.map(visit => <article key={visit.id}><small>{when(visit.start, data.timeZone, true)} · {visit.service} · {masterName(visit.masterId)}</small><p>{visit.note}</p><button type="button" className={styles.textButton} onClick={() => onOpenVisit(visit.id)}>Открыть визит<ProtoIcon name="arrow" size={15} /></button></article>)}{!client.note && !notes.length && <p className={css.feedback}>Предпочтений пока нет. Добавьте их через «Изменить»: оттенок, аллергии, удобное время.</p>}</div>}
      </section>
      <aside className={css.clientAside} aria-label="О клиенте">
        <h3>О клиенте</h3>
        <p>{client.note?.trim() || 'Предпочтения ещё не записаны. Их можно добавить в заметке клиента.'}</p>
        <BuilderV2OrderFacts title="Мессенджеры" items={[]} messengers={messengers} />
      </aside>
    </div>
  </div>
}

export function BookingClientProfile({ app, screenId, clientId, backLabel = 'Клиенты', onBack, onOpenVisit, onBook, onEdit }: { app: AppV2; screenId: string; clientId: string; backLabel?: string; onBack: () => void; onOpenVisit: (id: string) => void; onBook: () => void; onEdit?: () => void }) {
  const { result, retry } = useBookingPeople(app, screenId)
  if (!result) return <p role="status" className={css.feedback}>Загружаем карточку клиента…</p>
  if (!result.ok) return <div role="alert" className={css.feedback}><p>{result.error}</p><button type="button" className={styles.secondary} onClick={retry}>Повторить загрузку</button></div>
  const client = result.data.clients.find(item => item.id === clientId)
  if (!client) return <div className={css.clientPage}><button type="button" className={styles.textButton} onClick={onBack}><ProtoIcon name="back" />{backLabel}</button><p className={css.feedback}>Карточка недоступна. Проверьте, что клиент и его записи доступны вашему аккаунту.</p></div>
  return <ClientProfileView client={client} data={result.data} backLabel={backLabel} onBack={onBack} onOpenVisit={onOpenVisit} onBook={onBook} onEdit={onEdit} />
}

function Visits({ visits, timeZone, masters, onOpen }: { visits: BookingPersonVisit[]; timeZone: string; masters: { id: string; name: string }[]; onOpen: (id: string) => void }) {
  return <div className={css.visits}>{visits.map(visit => <RecordHistoryItem key={visit.id} title={visit.service} date={when(visit.start,timeZone,true)} subtitle={masters.find(master => master.id === visit.masterId)?.name ?? 'Мастер'} status={bookingCalendarStatusNames[visit.status] ?? 'Визит'} amount={money(visit.price)} onOpen={() => onOpen(visit.id)}/>)}</div>
}

/** Booking-specific live summary stays separate from the configurable record blocks. */
export function BookingClientNextVisit({ app, screenId, clientId, onOpen }: { app: AppV2; screenId: string; clientId: string; onOpen: (id: string) => void }) {
  const { result } = useBookingPeople(app,screenId)
  if (!result?.ok) return null
  const visits = result.data.visits.filter(visit => visit.clientId === clientId && future(visit)), next = visits[0]
  if (!next) return <p className={css.summaryEmpty}>Предстоящих записей нет</p>
  return <button type="button" className={css.nextVisit} onClick={() => onOpen(next.id)}><ProtoIcon name="calendar"/><span><strong>Ближайший визит · {when(next.start,result.data.timeZone,true)}</strong><small>{next.service} · {result.data.masters.find(master => master.id === next.masterId)?.name} · Предстоящих записей: {visits.length}</small></span><ProtoIcon name="arrow" size={16}/></button>
}

export function BookingPeopleScreen({ app, screenId, initialMasterId, initialClientVisitId, initialClientId, onNavigate, onClose, onAddMaster, onEditMaster, onAddClient, onEditClient }: { app: AppV2; screenId: string; initialMasterId?: string; initialClientVisitId?: string; initialClientId?: string; onNavigate: (screenId: string, rowId?: string) => void; onClose?: () => void; onAddMaster?: () => void; onEditMaster?: () => void; onAddClient?: () => void; onEditClient?: () => void }) {
  const { result, retry } = useBookingPeople(app, screenId), journey = useBookingJourney()
  const clientsOnly = screenId === app.booking?.customersScreenId
  const [tab, setTab] = useState(clientsOnly ? 'clients' : 'masters'), [search, setSearch] = useState(''), [selected, setSelected] = useState<{ type: 'master' | 'client'; id: string } | null>(initialMasterId ? { type: 'master', id: initialMasterId } : null)
  if (!result) return <p role="status" className={css.feedback}>Загружаем команду и клиентов…</p>
  if (!result.ok) return <div role="alert" className={css.feedback}><p>{result.error}</p><button type="button" className={styles.secondary} onClick={retry}>Повторить загрузку</button></div>
  const data = result.data, booking = app.booking!
  const selectedClient = initialClientVisitId ? data.visits.find(visit => visit.id === initialClientVisitId)?.clientId : undefined
  const choice = initialClientId ? { type: 'client', id: initialClientId } : initialMasterId ? { type: 'master', id: initialMasterId } : selectedClient ? { type: 'client', id: selectedClient } : selected
  const close = () => { if (onClose) onClose(); else setSelected(null) }
  const book = (intent: Parameters<NonNullable<typeof journey>['setIntent']>[0]) => { journey?.setIntent(intent); onNavigate(booking.catalogScreenId) }
  const schedule = (masterId: string) => { journey?.setCalendar({ masterId, day: data.day }); onNavigate(booking.listScreenId!) }
  const openVisit = (id: string) => onNavigate(booking.visitScreenId, id)
  const query = search.toLocaleLowerCase('ru-RU').trim()
  const shifts = (masterId: string) => bookingCalendarShift(data.shifts.find(shift => shift.resourceId === masterId)?.windows ?? [])
  const hoursLabel = (masterId: string) => {
    const row = data.shifts.find(shift => shift.resourceId === masterId), shift = shifts(masterId)
    return shift ? `${bookingClock(shift.start)}–${bookingClock(shift.end)}` : !row || row.windows === null ? 'Часы недоступны' : row.closed ? 'Выходной' : 'Нет смены сегодня'
  }
  const filteredMasters = data.masters.filter(master => `${master.name} ${master.role} ${master.description}`.toLocaleLowerCase('ru-RU').includes(query))
  const filteredClients = data.clients.filter(client => `${client.name} ${client.phone} ${client.email}`.toLocaleLowerCase('ru-RU').includes(query))
  const todayVisits = (masterId: string) => data.visits.filter(visit => visit.masterId === masterId && visit.status !== 'cancelled' && instantToWallClock(visit.start, data.timeZone)?.date === data.day)
  const client = choice?.type === 'client' ? data.clients.find(client => client.id === choice.id) : undefined
  const master = choice?.type === 'master' ? data.masters.find(master => master.id === choice.id) : undefined
  if ((initialClientVisitId || initialMasterId || initialClientId) && !client && !master) return <div className={css.profile}><button type="button" className={styles.textButton} onClick={close}><ProtoIcon name="back" />Назад</button><p className={css.feedback}>Профиль недоступен. Проверьте, что запись и её данные доступны вашему аккаунту.</p></div>

  if (client) {
    return <ClientProfileView client={client} data={data} backLabel={initialClientVisitId ? 'К записи' : 'Клиенты'} onBack={close} onOpenVisit={openVisit} onBook={() => book({ ...(client.persistent ? { clientId: client.id } : {}), client: client.name, phone: client.phone, email: client.email })} onEdit={onEditClient && client.persistent ? onEditClient : undefined} />
  }
  if (master) {
    const visits = todayVisits(master.id)
    const month = masterMonthSummary(data.visits, master.id, data.timeZone)
    return <div className={css.profile} data-booking-master-profile><button type="button" className={styles.textButton} onClick={close}><ProtoIcon name="back" />Мастера</button>
      <section className={css.profileCard}>
        <div className={css.clientIdentity}>
          <BookingAvatar name={master.name} photo={master.photo} />
          <div><h2>{master.name}</h2><p>{master.role || 'Мастер'}</p></div>
        </div>
        <dl className={css.metrics}><div><dd>{month.appointments}</dd><dt>Записей за месяц</dt></div><div><dd>{rub(month.revenue)}</dd><dt>Выручка за месяц</dt></div><div><dd className={css.hoursValue}>{hoursLabel(master.id)}</dd><dt>Часы сегодня</dt></div></dl>
        <div className={css.actions}><button type="button" className={styles.primary} onClick={() => schedule(master.id)}><ProtoIcon name="calendar" />Открыть расписание</button><button type="button" className={styles.secondary} onClick={() => book({ masterId: master.id })}>Записать</button>{onEditMaster && <button type="button" className={styles.textButton} onClick={onEditMaster}>Изменить</button>}</div>
      </section>
      <section className={css.serviceSection}><h3>Услуги мастера</h3><div className={css.serviceTags}>{master.services.map(service => <span key={service}>{service}</span>)}</div></section>
      <h3 className={css.sectionTitle}>Записи сегодня</h3><Visits visits={visits} timeZone={data.timeZone} masters={data.masters} onOpen={openVisit} />{!visits.length && <p className={css.feedback}>На сегодня записей нет.</p>}
    </div>
  }
  return <div data-booking-people><ListScreenShell title={clientsOnly ? 'Клиенты' : booking.clients ? 'Мастера' : 'Команда и клиенты'} meta={clientsOnly ? 'Контакты и история посещений' : 'Услуги, график и записи мастеров'} actions={tab === 'clients' && onAddClient ? <button type="button" className={styles.primary} onClick={onAddClient}><ProtoIcon name="plus" />Добавить клиента</button> : tab === 'masters' && onAddMaster && <button type="button" className={styles.primary} onClick={onAddMaster}><ProtoIcon name="plus" />Добавить мастера</button>} tabs={booking.clients ? undefined : [{ id: 'masters', label: 'Мастера' }, { id: 'clients', label: 'Клиенты' }]} activeTab={tab} onTabChange={value => { setTab(value); setSearch('') }} search={<ShellSearchField value={search} onChange={setSearch} placeholder={tab === 'masters' ? 'Найти мастера' : 'Имя, телефон или почта клиента'} />}>
    <div className={tab === 'masters' ? css.teamGrid : css.directory}>{tab === 'masters' ? filteredMasters.map(master => {
      const month = masterMonthSummary(data.visits, master.id, data.timeZone)
      const role = master.role || master.services[0] || 'Мастер'
      return <button type="button" key={master.id} className={css.teamCard} onClick={() => onNavigate(booking.masterScreenId, master.id)}><BookingAvatar name={master.name} photo={master.photo} /><span className={css.teamCopy}><strong>{master.name}</strong><small>{role}</small></span><span className={css.teamStats}><span><b>{month.appointments}</b><small>записей за месяц</small></span><span><b>{rub(month.revenue)}</b><small>выручка за месяц</small></span></span></button>
    }) : filteredClients.map(client => {
      const visits = data.visits.filter(visit => visit.clientId === client.id), next = visits.find(future)
      return <button type="button" key={client.id} className={css.personCard} onClick={() => { if (client.persistent && booking.customerScreenId) onNavigate(booking.customerScreenId, client.id); else setSelected({ type: 'client', id: client.id }) }}><BookingAvatar name={client.name} /><span className={css.personCopy}><strong>{client.name}</strong><small>{client.phone || client.email || 'Контакты не указаны'}</small><span className={css.personMeta}>{bookingCountLabel(visits.length, ['визит','визита','визитов'])}</span><span className={css.personLink}>{next ? `Ближайший · ${when(next.start, data.timeZone, true)}` : 'История посещений'}<ProtoIcon name="arrow" size={16} /></span></span></button>
    })}</div>
    {tab === 'clients' && !data.clients.length && <p className={css.feedback}>Клиенты появятся здесь после первой записи на услугу.</p>}
    {query && !(tab === 'masters' ? filteredMasters.length : filteredClients.length) && <p className={css.feedback}>Ничего не нашли. Измените имя или очистите поиск.</p>}
  </ListScreenShell></div>
}
