'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { instantToWallClock } from '@tableapp/schema'
import type { AppV2, AppV2Json } from '@tableapp/schema/app-v2'
import type { BookingAvailabilityRequest, BookingAvailabilityResult } from '@/lib/builder-v2-booking-availability'
import { oneRelation } from '@/lib/booking'
import { usePublishedV2 } from './published-context'
import { useBuilderV2FormContext } from './form-preview'
import css from './booking.module.css'
import styles from '../prototype/prototype.module.css'
import { useBookingJourney } from './booking-journey'
import { BookingClientPicker } from './booking-client-picker'
export const BookingDemoAvailability = createContext<((request: BookingAvailabilityRequest) => BookingAvailabilityResult) | null>(null)

export function BookingTimeFields({ app, editing }: { app: AppV2; editing: boolean }) {
  const context = useBuilderV2FormContext(), published = usePublishedV2(), config = app.booking!
  const journey = useBookingJourney(), seed = context?.scope.screenId === config.formScreenId ? journey?.intent : null
  const demoAvailability = useContext(BookingDemoAvailability)
  const [day, setDay] = useState(seed?.day ?? ''), [master, setMaster] = useState(seed?.masterId ?? ''), [retry, setRetry] = useState(0), [seedNotice, setSeedNotice] = useState('')
  const appliedTime = useRef(false), appliedClient = useRef(false), seededFor = useRef<string | null>(null)
  const [result, setResult] = useState<BookingAvailabilityResult>(), [loading, setLoading] = useState(false)
  const selected = oneRelation(context?.values[config.visit.master])
  const chosen = context?.values[config.visit.start]
  const latest = useRef(context); latest.current = context
  const pickedService = oneRelation(context?.values[config.visit.service])
  const recordId = context?.scope.recordId ?? (context?.scope.formId === config.ownerCreateFormId ? pickedService ?? undefined : undefined)
  const screenId = context?.scope.screenId
  const reschedule = screenId === config.rescheduleScreenId
  const timeZone = result?.ok ? result.timeZone : context?.state?.fields.find(field => field.fieldId === config.visit.start)?.timeZone ?? 'Europe/Moscow'
  const today = instantToWallClock(new Date(), timeZone)!.date
  const selectedDay = day || (typeof chosen === 'string' && chosen ? instantToWallClock(chosen, timeZone)?.date : undefined) || today
  useEffect(() => {
    if (editing || !context?.state || appliedClient.current || !seed || context.scope.formId !== config.ownerCreateFormId) return
    appliedClient.current = true
    for (const [fieldId, value] of [[config.visit.client, seed.client], [config.visit.phone, seed.phone], [config.visit.email, seed.email]] as const) if (value && context.state.fields.some(field => field.fieldId === fieldId && !field.readOnly)) context.change(fieldId, value)
  }, [Boolean(context?.state), editing])
  useEffect(() => {
    if (editing || !recordId || !screenId || !context?.state) return
    let cancelled = false
    setLoading(true)
    const input = { screenId, recordId, day: selectedDay, masterId: master }
    const load = async () => {
      if (demoAvailability) return demoAvailability(input)
      const actions = await import('@/app/builder-v2-booking-actions')
      return published ? actions.readPublishedV2BookingAction(published.slug, { ...input, revision: published.revision }) : actions.readBuilderV2BookingAction(app.id, app, input)
    }
    void load()
      .then(next => {
        if (cancelled) return
        setResult(next)
        if (seed?.time && !appliedTime.current && seededFor.current !== (recordId ?? null) && next.ok) {
          seededFor.current = recordId ?? null
          const slot = next.slots.find(slot => slot.time === seed.time && slot.masterId === seed.masterId && selectedDay === seed.day)
          if (slot) { latest.current?.change(config.visit.master, [slot.masterId]); latest.current?.change(config.visit.start, slot.start) }
          else setSeedNotice('Выбранное время занято или не подходит для этой услуги. Выберите другое свободное время или мастера.')
        }
      })
      .catch(() => { if (!cancelled) setResult({ ok: false, error: 'Не удалось проверить расписание. Попробуйте ещё раз.' }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [recordId, screenId, selectedDay, master, retry, Boolean(context?.state), editing, published?.dataVersion, published?.revision])
  const change = (fieldId: string, value: AppV2Json) => latest.current?.change(fieldId, value)
  const resetChoice = () => { change(config.visit.master, []); change(config.visit.start, null) }
  return <div className={css.timeFields}>
    {config.clients && context && context.scope.formId === config.ownerCreateFormId && context.state?.fields.some(field => field.fieldId === config.clients!.linkFieldId && !field.readOnly) && !editing && <BookingClientPicker app={app} />}
    <div className={css.formIntro}><strong>{reschedule ? 'Выберите другое время' : 'Когда вам удобно?'}</strong><p>{reschedule ? 'Текущая запись останется за вами, пока новое время не сохранится.' : 'Свободные часы учитывают длительность услуги и перерывы мастера.'}</p></div>
    <div className={css.timeControls}>
      <label>Мастер<select aria-label="Мастер" value={master} disabled={context?.disabled || editing || loading} onChange={event => { appliedTime.current = true; setSeedNotice(''); setDay(selectedDay); setMaster(event.target.value); resetChoice() }}><option value="">Любой свободный</option>{result?.ok && master && !result.masters.some(item => item.id === master) && <option value={master}>Не оказывает эту услугу</option>}{result?.ok && result.masters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Дата<input aria-label="Дата записи" type="date" min={today} max={new Date(new Date(`${today}T12:00:00Z`).getTime() + config.horizonDays * 86400000).toISOString().slice(0, 10)} value={selectedDay} disabled={context?.disabled || editing} onChange={event => { if (event.target.value) { appliedTime.current = true; setSeedNotice(''); setDay(event.target.value); resetChoice() } }} /></label>
    </div>
    {seedNotice && <p role="status" className={css.timeHint}>{seedNotice}</p>}
    <fieldset disabled={context?.disabled || loading || editing}><legend>Свободное время</legend>
      {loading ? <p role="status">Проверяем расписание…</p> : result?.ok ? <>
        <p className={css.timeHint}>Местное время студии · {new Intl.DateTimeFormat('ru-RU', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value.replace('GMT', 'UTC')}</p>
        {result.slots.length ? <div className={css.slots}>{result.slots.map(slot => <button key={`${slot.start}:${slot.masterId}`} type="button" aria-pressed={selected === slot.masterId && chosen === slot.start} onClick={() => { change(config.visit.master, [slot.masterId]); change(config.visit.start, slot.start) }}><strong>{slot.time}</strong><span>{slot.masterName}</span></button>)}</div> : <p role="status" className={css.empty}>На эту дату нет свободного времени. Выберите другую дату или мастера.</p>}
      </> : editing ? <p className={css.timeHint}>Клиент выберет здесь свободное время из расписания мастера.</p> : result && !result.ok ? <div role="alert"><p>{result.error}</p><button type="button" className={styles.secondary} onClick={() => setRetry(value => value + 1)}>Проверить ещё раз</button></div> : null}
    </fieldset>
    {context?.state?.fields.filter(field => [config.visit.master, config.visit.start].includes(field.fieldId) && context.errors[field.nodeId]).map(field => <p key={field.nodeId} role="alert" className={css.error}>{context.errors[field.nodeId]}</p>)}
  </div>
}
