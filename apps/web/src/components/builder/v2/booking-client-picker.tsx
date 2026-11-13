'use client'
import { useEffect, useRef, useState } from 'react'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { oneRelation } from '@/lib/booking'
import type { BookingClient } from '@/lib/builder-v2-booking-people'
import { useBuilderV2FormContext } from './form-preview'
import { useBookingPeople } from './booking-people-data'
import { useBookingJourney } from './booking-journey'
import css from './booking.module.css'

export function BookingClientPicker({ app }: { app: AppV2 }) {
  const context = useBuilderV2FormContext()!, c = app.booking!.clients!, b = app.booking!, journey = useBookingJourney()
  const { result, retry } = useBookingPeople(app, context.scope.screenId)
  const applied = useRef(false), [notice, setNotice] = useState('')
  const selectedId = oneRelation(context.values[c.linkFieldId])
  const clients = result?.ok ? result.data.clients.filter(client => client.persistent) : []
  const selected = clients.find(client => client.id === selectedId)
  const choose = (client?: BookingClient) => {
    context.change(c.linkFieldId, client ? [client.id] : [])
    context.change(b.visit.client, client?.name ?? '')
    context.change(b.visit.phone, client?.phone ?? '')
    context.change(b.visit.email, client?.email ?? '')
  }
  useEffect(() => {
    if (applied.current || !context.state || !result?.ok) return
    applied.current = true
    if (!journey?.intent?.clientId) return
    const client = clients.find(client => client.id === journey.intent!.clientId)
    choose(client)
    if (!client) setNotice('Клиент недоступен. Выберите клиента или добавьте нового.')
  }, [Boolean(context.state), result])
  return <section className={css.clientPicker} aria-label="Клиент для записи">
    <label>Клиент<select aria-label="Клиент для записи" value={selectedId ?? ''} disabled={context.disabled || !result?.ok} onChange={event => { setNotice(''); choose(clients.find(client => client.id === event.target.value)) }}><option value="">Новый клиент</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}{client.phone ? ` · ${client.phone}` : ''}</option>)}</select></label>
    {!result && <p role="status">Загружаем клиентов…</p>}
    {result && !result.ok && <div role="alert"><p>{result.error}</p><button type="button" onClick={retry}>Повторить загрузку</button></div>}
    {selected ? <p>{selected.phone}{selected.email ? ` · ${selected.email}` : ''}</p> : <p>Введите имя и контакты ниже. Карточка клиента создастся вместе с визитом.</p>}
    {notice && <p role="alert">{notice}</p>}
  </section>
}
