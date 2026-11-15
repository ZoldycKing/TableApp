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
import { RecordProfileCard, RecordHistoryItem } from './record-blocks'
import { builderV2MediaItems } from './media-values'
import { usePublishedV2 } from './published-context'

const money = (amount: number | null) => amount === null ? 'Цена не указана' : `${amount.toLocaleString('ru-RU')} ₽`
const when = (start: string, timeZone: string, date = false) => new Date(start).toLocaleString('ru-RU', { ...(date ? { day: 'numeric', month: 'short', year: 'numeric' } as const : {}), hour: '2-digit', minute: '2-digit', timeZone })
const future = (visit: BookingPersonVisit) => visit.status === 'booked' && Date.parse(visit.start) > Date.now()

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
  const { result, retry } = useBookingPeople(app, screenId), journey = useBookingJourney(), published = usePublishedV2()
  const clientsOnly = screenId === app.booking?.customersScreenId
  const [tab, setTab] = useState(clientsOnly ? 'clients' : 'masters'), [search, setSearch] = useState(''), [selected, setSelected] = useState<{ type: 'master' | 'client'; id: string } | null>(initialMasterId ? { type: 'master', id: initialMasterId } : null), [profileTab, setProfileTab] = useState('history')
  if (!result) return <p role="status" className={css.feedback}>Загружаем команду и клиентов…</p>
  if (!result.ok) return <div role="alert" className={css.feedback}><p>{result.error}</p><button type="button" className={styles.secondary} onClick={retry}>Повторить загрузку</button></div>
  const data = result.data, booking = app.booking!
  const selectedClient = initialClientVisitId ? data.visits.find(visit => visit.id === initialClientVisitId)?.clientId : undefined
  const choice = initialClientId ? { type: 'client', id: initialClientId } : initialMasterId ? { type: 'master', id: initialMasterId } : selectedClient ? { type: 'client', id: selectedClient } : selected
  const close = () => { if (onClose) onClose(); else { setSelected(null); setProfileTab('history') } }
  const book = (intent: Parameters<NonNullable<typeof journey>['setIntent']>[0]) => { journey?.setIntent(intent); onNavigate(booking.catalogScreenId) }
  const schedule = (masterId: string) => { journey?.setCalendar({ masterId, day: data.day }); onNavigate(booking.listScreenId!) }
  const openVisit = (id: string) => onNavigate(booking.visitScreenId, id)
  const query = search.toLocaleLowerCase('ru-RU').trim()
  const shifts = (masterId: string) => bookingCalendarShift(data.shifts.find(shift => shift.resourceId === masterId)?.windows ?? [])
  const hoursLabel = (masterId: string) => {
    const row = data.shifts.find(shift => shift.resourceId === masterId), shift = shifts(masterId)
    return shift ? `${bookingClock(shift.start)}–${bookingClock(shift.end)}` : !row || row.windows === null ? 'Часы недоступны' : row.closed ? 'Выходной' : 'Нет смены сегодня'
  }
  const filteredMasters = data.masters.filter(master => `${master.name} ${master.description}`.toLocaleLowerCase('ru-RU').includes(query))
  const filteredClients = data.clients.filter(client => `${client.name} ${client.phone} ${client.email}`.toLocaleLowerCase('ru-RU').includes(query))
  const todayVisits = (masterId: string) => data.visits.filter(visit => visit.masterId === masterId && visit.status !== 'cancelled' && instantToWallClock(visit.start, data.timeZone)?.date === data.day)
  const client = choice?.type === 'client' ? data.clients.find(client => client.id === choice.id) : undefined
  const master = choice?.type === 'master' ? data.masters.find(master => master.id === choice.id) : undefined
  if ((initialClientVisitId || initialMasterId || initialClientId) && !client && !master) return <div className={css.profile}><button type="button" className={styles.textButton} onClick={close}><ProtoIcon name="back" />Назад</button><p className={css.feedback}>Профиль недоступен. Проверьте, что запись и её данные доступны вашему аккаунту.</p></div>

  if (client) {
    const visits = data.visits.filter(visit => visit.clientId === client.id), completed = visits.filter(visit => visit.status === 'completed'), upcoming = visits.filter(future), next = upcoming[0]
    const total = completed.some(visit => visit.price === null) ? null : completed.reduce((sum, visit) => sum + visit.price!, 0)
    const notes = [...visits].reverse().filter(visit => visit.note.trim())
    return <div className={css.profile} data-booking-client-profile>
      <button type="button" className={styles.textButton} onClick={close}><ProtoIcon name="back" />{initialClientVisitId ? 'К записи' : 'Клиенты'}</button>
      <RecordProfileCard className={css.profileCard} title={client.name} contacts={[{ label: 'Телефон', kind: 'phone', value: client.phone },{ label: 'Почта', kind: 'email', value: client.email }]}>
        <dl className={css.metrics}><div><dd>{completed.length}</dd><dt>Завершённых визитов</dt></div><div><dd>{money(total)}</dd><dt>За завершённые визиты</dt></div><div><dd>{upcoming.length}</dd><dt>Предстоящих записей</dt></div></dl>
        <div className={css.actions}><button type="button" className={styles.primary} onClick={() => book({ ...(client.persistent ? { clientId: client.id } : {}), client: client.name, phone: client.phone, email: client.email })}><ProtoIcon name="plus" />Записать клиента</button>{onEditClient && client.persistent && <button type="button" className={styles.secondary} onClick={onEditClient}>Изменить клиента</button>}</div>
      </RecordProfileCard>
      {next && <button type="button" className={css.nextVisit} onClick={() => openVisit(next.id)}><ProtoIcon name="calendar" /><span><strong>Ближайший визит · {when(next.start, data.timeZone, true)}</strong><small>{next.service} · {data.masters.find(master => master.id === next.masterId)?.name}</small></span><ProtoIcon name="arrow" size={16} /></button>}
      <div className={css.profileTabs} role="group" aria-label="Раздел профиля клиента"><button type="button" aria-pressed={profileTab === 'history'} onClick={() => setProfileTab('history')}>История посещений</button><button type="button" aria-pressed={profileTab === 'notes'} onClick={() => setProfileTab('notes')}>Заметки</button></div>
      {profileTab === 'history' ? visits.length ? <Visits visits={[...visits].reverse()} timeZone={data.timeZone} masters={data.masters} onOpen={openVisit} /> : <p className={css.feedback}>Визитов пока нет. Нажмите «Записать клиента», чтобы выбрать услугу и время.</p> : <div className={css.notes}>{client.note && <article><h3>Заметки о клиенте</h3><p>{client.note}</p></article>}{notes.map(visit => <article key={visit.id}><small>{when(visit.start, data.timeZone, true)} · {visit.service}</small><p>{visit.note}</p><button type="button" className={styles.textButton} onClick={() => openVisit(visit.id)}>Открыть визит и изменить заметку<ProtoIcon name="arrow" size={15} /></button></article>)}{!client.note && !notes.length && <p className={css.feedback}>Заметок пока нет.{client.persistent ? ' Добавьте их через «Изменить клиента».' : ' Их можно добавить в карточке визита.'}</p>}</div>}
    </div>
  }
  if (master) {
    const visits = todayVisits(master.id), next = visits.find(future)
    return <div className={css.profile} data-booking-master-profile><button type="button" className={styles.textButton} onClick={close}><ProtoIcon name="back" />Мастера</button>
      <RecordProfileCard className={css.profileCard} title={master.name} subtitle={master.description || 'Мастер студии'} image={builderV2MediaItems(master.photo,published?.slug).find(item => item.image)}>
        <dl className={css.metrics}><div><dd>{visits.length}</dd><dt>Записей сегодня</dt></div><div><dd className={css.hoursValue}>{hoursLabel(master.id)}</dd><dt>Рабочие часы сегодня</dt></div><div><dd>{next ? when(next.start, data.timeZone) : 'Нет'}</dd><dt>Следующая сегодня</dt></div></dl>
        <div className={css.actions}><button type="button" className={styles.primary} onClick={() => schedule(master.id)}><ProtoIcon name="calendar" />Открыть расписание</button><button type="button" className={styles.secondary} onClick={() => book({ masterId: master.id })}>Записать клиента</button>{onEditMaster && <button type="button" className={styles.secondary} onClick={onEditMaster}>Изменить мастера</button>}</div>
      </RecordProfileCard>
      <section className={css.serviceSection}><h3>Услуги мастера</h3><div className={css.serviceTags}>{master.services.map(service => <span key={service}>{service}</span>)}</div></section>
      <h3 className={css.sectionTitle}>Записи сегодня</h3><Visits visits={visits} timeZone={data.timeZone} masters={data.masters} onOpen={openVisit} />{!visits.length && <p className={css.feedback}>На сегодня записей нет.</p>}
    </div>
  }
  return <div data-booking-people><ListScreenShell title={clientsOnly ? 'Клиенты' : booking.clients ? 'Мастера' : 'Команда и клиенты'} meta={clientsOnly ? 'Контакты и история посещений' : 'Услуги, график и записи мастеров'} actions={tab === 'clients' && onAddClient ? <button type="button" className={styles.primary} onClick={onAddClient}><ProtoIcon name="plus" />Добавить клиента</button> : tab === 'masters' && onAddMaster && <button type="button" className={styles.primary} onClick={onAddMaster}><ProtoIcon name="plus" />Добавить мастера</button>} tabs={booking.clients ? undefined : [{ id: 'masters', label: 'Мастера' }, { id: 'clients', label: 'Клиенты' }]} activeTab={tab} onTabChange={value => { setTab(value); setSearch('') }} search={<ShellSearchField value={search} onChange={setSearch} placeholder={tab === 'masters' ? 'Найти мастера' : 'Имя, телефон или почта клиента'} />}>
    <div className={css.directory}>{tab === 'masters' ? filteredMasters.map(master => {
      const visits = todayVisits(master.id), next = visits.find(future)
      return <button type="button" key={master.id} className={css.personCard} onClick={() => onNavigate(booking.masterScreenId, master.id)}><BookingAvatar name={master.name} photo={master.photo} /><span className={css.personCopy}><strong>{master.name}</strong><small>{master.services.join(' · ') || 'Мастер студии'}</small><span className={css.personMeta}><span>{hoursLabel(master.id)}</span><span>{bookingCountLabel(visits.length)} сегодня</span></span><span className={css.personLink}>{next ? `Ближайшая · ${when(next.start, data.timeZone)}` : 'Открыть профиль'}<ProtoIcon name="arrow" size={16} /></span></span></button>
    }) : filteredClients.map(client => {
      const visits = data.visits.filter(visit => visit.clientId === client.id), next = visits.find(future)
      return <button type="button" key={client.id} className={css.personCard} onClick={() => { if (client.persistent && booking.customerScreenId) onNavigate(booking.customerScreenId, client.id); else { setSelected({ type: 'client', id: client.id }); setProfileTab('history') } }}><BookingAvatar name={client.name} /><span className={css.personCopy}><strong>{client.name}</strong><small>{client.phone || client.email || 'Контакты не указаны'}</small><span className={css.personMeta}>{bookingCountLabel(visits.length, ['визит','визита','визитов'])}</span><span className={css.personLink}>{next ? `Ближайший · ${when(next.start, data.timeZone, true)}` : 'История посещений'}<ProtoIcon name="arrow" size={16} /></span></span></button>
    })}</div>
    {tab === 'clients' && !data.clients.length && <p className={css.feedback}>Клиенты появятся здесь после первой записи на услугу.</p>}
    {query && !(tab === 'masters' ? filteredMasters.length : filteredClients.length) && <p className={css.feedback}>Ничего не нашли. Измените имя или очистите поиск.</p>}
  </ListScreenShell></div>
}
