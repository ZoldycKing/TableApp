'use client'

import { fieldTimeZone, instantToWallClock } from '@tableapp/schema'
import { useEffect, useRef, useState } from 'react'
import { bookingAvailabilityAction } from '@/app/booking-actions'
import { freeBookingSlots, oneRelation, type BookingData, type BookingSlot } from '@/lib/booking'
import type { RuntimeApp } from '@/lib/app-runtime'
import type { TableRow } from '@/lib/table-store'
import { accentTones } from './ui'

export function BookingForm({ runtime, row, demo, pending, initialValues, onSubmit }: {
  runtime: RuntimeApp; row: TableRow | null; demo: boolean; pending: boolean; initialValues?: Record<string, unknown> | null; onSubmit: (values: Record<string, unknown>) => void
}) {
  const config = runtime.app.booking!, visit = config.visit, accent = accentTones(runtime.app.theme.accent)
  const fields = runtime.tables[config.tables.visits]?.fields ?? []
  const startField = fields.find(field => field.id === visit.start)
  const timeZone = startField ? fieldTimeZone(startField) : 'Europe/Moscow'
  const services = (runtime.tables[config.tables.services]?.rows ?? []).filter(row => row.data[config.service.active] === true)
  const seed = row?.data ?? initialValues
  const restoreSlot = useRef(initialValues?.[visit.start] ? { start: String(initialValues[visit.start]), master: oneRelation(initialValues[visit.master]) } : null)
  const [serviceId, setServiceId] = useState(oneRelation(seed?.[visit.service]) ?? '')
  const [masterId, setMasterId] = useState(oneRelation(seed?.[visit.master]) ?? '')
  const [day, setDay] = useState(instantToWallClock(seed?.[visit.start] ? String(seed[visit.start]) : new Date(), timeZone)!.date)
  const [name, setName] = useState(String(seed?.[visit.client] ?? ''))
  const [phone, setPhone] = useState(String(seed?.[visit.phone] ?? ''))
  const [customerEmail, setCustomerEmail] = useState('')
  const administrator = runtime.app.screens.some(screen => screen.id === config.setupScreenId)
  const [slots, setSlots] = useState<BookingSlot[]>([]), [masters, setMasters] = useState<{ id: string; name: string }[]>([])
  const [chosen, setChosen] = useState<BookingSlot | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let stopped = false
    setChosen(null); setSlots([]); setError(null)
    if (!serviceId || !day) return
    setLoading(true)
    const load = async () => {
      if (demo) {
        const data: BookingData = { services, masters: runtime.tables[config.tables.masters]?.rows ?? [], schedule: runtime.tables[config.tables.schedule]?.rows ?? [],
          visits: runtime.tables[config.tables.visits]?.rows ?? [], timeZone }
        const available = freeBookingSlots(config, data, { serviceId, day, masterId: masterId || undefined, excludeId: row?.id, minutes: row ? Number(row.data[visit.minutes]) : undefined })
        return { ok: true as const, slots: available, masters: data.masters.map(master => ({ id: master.id, name: String(master.data[config.master.name]) })), timeZone }
      }
      return bookingAvailabilityAction(runtime.app.slug, serviceId, day, masterId, row?.id)
    }
    void load().then(result => {
      if (stopped) return
      if (result.ok) {
        setSlots(result.slots); setMasters(result.masters)
        if (restoreSlot.current) { setChosen(result.slots.find(slot => slot.start === restoreSlot.current!.start && slot.masterId === restoreSlot.current!.master) ?? null); restoreSlot.current = null }
      } else setError(result.error)
    }).catch(() => { if (!stopped) setError('Не удалось загрузить свободное время. Выберите дату ещё раз.') })
      .finally(() => { if (!stopped) setLoading(false) })
    return () => { stopped = true }
  }, [serviceId, day, masterId, runtime.app.slug, row?.id, demo, timeZone])
  const service = services.find(row => row.id === serviceId)
  const inputClass = 'w-full rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400'
  return <form className="mx-auto max-w-xl space-y-5 rounded-2xl border border-sand-200 bg-white p-5 shadow-soft" onSubmit={event => {
    event.preventDefault()
    if (!chosen || loading || pending) return
    onSubmit({ [visit.service]: [serviceId], [visit.master]: [chosen.masterId], [visit.start]: chosen.start,
      ...(row ? {} : { [visit.client]: name.trim(), [visit.phone]: phone.trim(), ...(administrator && customerEmail.trim() ? { [visit.email]: customerEmail.trim().toLowerCase() } : {}) }) })
  }}>
    <p className="text-sm leading-relaxed text-ink-muted">{row ? 'Выберите новое свободное время. Если его успеют занять, ваша текущая запись сохранится.' : 'Выберите услугу и свободное время. Оплата при записи не требуется.'}</p>
    <label className="block space-y-1.5 text-sm font-medium">Услуга<select aria-label="Услуга" required value={serviceId} disabled={Boolean(row) || pending} className={inputClass} onChange={event => { setServiceId(event.target.value); setMasterId('') }}>
      <option value="">Выберите услугу</option>{services.map(service => <option key={service.id} value={service.id}>{String(service.data[config.service.name])}{row ? '' : ` · ${String(service.data[config.service.minutes])} мин · ${String(service.data[config.service.price])} ₽`}</option>)}
    </select></label>
    {service ? <p className="text-sm text-ink-muted">{row ? String(row.data[visit.minutes]) : String(service.data[config.service.minutes])} минут · {row ? String(row.data[visit.price]) : String(service.data[config.service.price])} ₽{row ? ' — условия вашей записи сохраняются' : ''}</p> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-medium">Мастер<select aria-label="Мастер" value={masterId} disabled={!serviceId || pending} className={inputClass} onChange={event => setMasterId(event.target.value)}>
        <option value="">Любой свободный мастер</option>{masters.map(master => <option key={master.id} value={master.id}>{master.name}</option>)}
      </select></label>
      <label className="space-y-1.5 text-sm font-medium">Дата<input aria-label="Дата" type="date" required value={day} min={instantToWallClock(new Date(), timeZone)!.date} className={inputClass} onChange={event => setDay(event.target.value)} disabled={pending} /></label>
    </div>
    <fieldset disabled={loading || pending}><legend className="mb-2 text-sm font-medium">Свободное время</legend>
      <p className="mb-3 text-xs text-ink-muted">Время салона: {timeZone}. Показываем интервалы, в которые помещается вся услуга.</p>
      {loading ? <p role="status" className="text-sm text-ink-muted">Проверяем расписание…</p> : !serviceId ? <p className="text-sm text-ink-muted">Сначала выберите услугу.</p> : !slots.length && !error ? <p role="status" className="text-sm text-ink-muted">На эту дату свободного времени нет. Выберите другой день или мастера.</p> : null}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{slots.map(slot => <button key={`${slot.start}:${slot.masterId}`} type="button" aria-label={`${slot.time} ${slot.masterName}`} aria-pressed={chosen?.start === slot.start && chosen.masterId === slot.masterId}
        onClick={() => setChosen(slot)} className={`rounded-xl border px-2 py-2.5 text-sm ${chosen?.start === slot.start && chosen.masterId === slot.masterId ? `${accent.solid} border-transparent text-white` : 'border-sand-200 hover:bg-sand-50'}`}>
        <span className="block font-semibold">{slot.time}</span><span className="block truncate text-xs">{slot.masterName}</span>
      </button>)}</div>
    </fieldset>
    {!row ? <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-medium">Ваше имя<input aria-label="Ваше имя" required maxLength={120} value={name} onChange={event => setName(event.target.value)} className={inputClass} autoComplete="name" disabled={pending} /></label>
      <label className="space-y-1.5 text-sm font-medium">Телефон<input aria-label="Телефон" required type="tel" value={phone} onChange={event => setPhone(event.target.value)} className={inputClass} autoComplete="tel" disabled={pending} /></label>
    </div> : null}
    {!row && administrator ? <label className="block space-y-1.5 text-sm font-medium">Почта клиента для кабинета (необязательно)<input aria-label="Почта клиента для кабинета" type="email" value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} className={inputClass} disabled={pending} /><span className="block text-xs font-normal text-ink-muted">Клиент увидит эту запись после входа с указанной почтой. Письмо автоматически не отправляется.</span></label> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {demo ? <p className="text-xs text-ink-muted">Это демонстрация: запись не сохранится.</p> : null}
    <button type="submit" disabled={!chosen || loading || pending} className={`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 ${accent.solid}`}>{pending ? 'Сохраняем…' : row ? 'Сохранить новое время' : 'Подтвердить запись'}</button>
  </form>
}
