'use client'

import { fieldTimeZone, instantToWallClock } from '@tableapp/schema'
import { useEffect, useRef, useState } from 'react'
import { bookingAvailabilityAction } from '@/app/booking-actions'
import { eligibleMasters, freeBookingSlots, oneRelation, type BookingData, type BookingSlot } from '@/lib/booking'
import type { RuntimeApp } from '@/lib/app-runtime'
import type { TableRow } from '@/lib/table-store'
import { RuDateInput } from '@/components/builder/v2/ru-fields'
import { accentTones } from './ui'

export type BookingFormDraft = {
  serviceId: string; masterId: string; day: string; name: string; phone: string; customerEmail: string; chosen: BookingSlot | null; baseVersion?: number
}

export function BookingForm({ runtime, row, demo, demoData, pending, initialValues, initialDraft, onDraftChange, availabilityRevision = 0, onSubmit }: {
  runtime: RuntimeApp; row: TableRow | null; demo: boolean; demoData?: BookingData; pending: boolean; initialValues?: Record<string, unknown> | null
  initialDraft?: BookingFormDraft | null; onDraftChange?: (draft: BookingFormDraft) => void; availabilityRevision?: number; onSubmit: (values: Record<string, unknown>) => void
}) {
  const config = runtime.app.booking!, visit = config.visit, accent = accentTones(runtime.app.theme.accent)
  const fields = runtime.tables[config.tables.visits]?.fields ?? []
  const startField = fields.find(field => field.id === visit.start)
  const timeZone = startField ? fieldTimeZone(startField) : 'Europe/Moscow'
  const services = (demo && demoData ? demoData.services : runtime.tables[config.tables.services]?.rows ?? []).filter(row => row.data[config.service.active] === true)
  const seed = row?.data ?? initialValues
  const baseVersion = useRef(initialDraft?.baseVersion ?? row?.version)
  const restoreSlot = useRef(initialDraft?.chosen ? { start: initialDraft.chosen.start, master: initialDraft.chosen.masterId }
    : initialValues?.[visit.start] ? { start: String(initialValues[visit.start]), master: oneRelation(initialValues[visit.master]) } : null)
  const [serviceId, setServiceId] = useState(initialDraft?.serviceId ?? oneRelation(seed?.[visit.service]) ?? '')
  const [masterId, setMasterId] = useState(initialDraft?.masterId ?? oneRelation(seed?.[visit.master]) ?? '')
  const [day, setDay] = useState(initialDraft?.day ?? instantToWallClock(seed?.[visit.start] ? String(seed[visit.start]) : new Date(), timeZone)!.date)
  const [name, setName] = useState(initialDraft?.name ?? String(seed?.[visit.client] ?? ''))
  const [phone, setPhone] = useState(initialDraft?.phone ?? String(seed?.[visit.phone] ?? ''))
  const [customerEmail, setCustomerEmail] = useState(initialDraft?.customerEmail ?? '')
  const administrator = runtime.app.screens.some(screen => screen.id === config.setupScreenId)
  const [slots, setSlots] = useState<BookingSlot[]>([]), [masters, setMasters] = useState<{ id: string; name: string }[]>([])
  const [chosen, setChosen] = useState<BookingSlot | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const chosenRef = useRef(chosen); chosenRef.current = chosen
  const draftCallback = useRef(onDraftChange); draftCallback.current = onDraftChange
  useEffect(() => {
    draftCallback.current?.({ serviceId, masterId, day, name, phone, customerEmail, chosen, baseVersion: baseVersion.current })
  }, [serviceId, masterId, day, name, phone, customerEmail, chosen])
  useEffect(() => {
    let stopped = false
    const previousChoice = chosenRef.current
    setChosen(null); setSlots([]); setError(null)
    if (!serviceId || !day) { setLoading(false); return }
    setLoading(true)
    const load = async () => {
      if (demo) {
        const data: BookingData = demoData ?? { services, masters: runtime.tables[config.tables.masters]?.rows ?? [], schedule: runtime.tables[config.tables.schedule]?.rows ?? [],
          visits: runtime.tables[config.tables.visits]?.rows ?? [], timeZone }
        const available = freeBookingSlots(config, data, { serviceId, day, masterId: masterId || undefined, excludeId: row?.id, minutes: row ? Number(row.data[visit.minutes]) : undefined })
        return { ok: true as const, slots: available, masters: eligibleMasters(config, data, serviceId).map(master => ({ id: master.id, name: String(master.data[config.master.name]) })), timeZone }
      }
      return bookingAvailabilityAction(runtime.app.slug, serviceId, day, masterId, row?.id)
    }
    void load().then(result => {
      if (stopped) return
      if (result.ok) {
        setSlots(result.slots); setMasters(result.masters)
        const restore = restoreSlot.current ?? (previousChoice ? { start: previousChoice.start, master: previousChoice.masterId } : null)
        if (restore) setChosen(result.slots.find(slot => slot.start === restore.start && slot.masterId === restore.master) ?? null)
        restoreSlot.current = null
      } else setError(result.error)
    }).catch(() => { if (!stopped) setError('Не удалось загрузить свободное время. Проверьте соединение и попробуйте ещё раз.') })
      .finally(() => { if (!stopped) setLoading(false) })
    return () => { stopped = true }
  }, [serviceId, day, masterId, runtime.app.slug, row?.id, demo, demoData, timeZone, retry, availabilityRevision])
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
      <label className="space-y-1.5 text-sm font-medium">Дата<RuDateInput aria-label="Дата" required value={day} min={instantToWallClock(new Date(), timeZone)!.date} className={inputClass} onValue={setDay} disabled={pending} /></label>
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
    {error ? <div className="space-y-2"><p role="alert" className="text-sm text-red-700">{error}</p><button type="button" disabled={loading || pending} onClick={() => setRetry(value => value + 1)} className="rounded-xl border border-sand-200 px-3 py-2 text-sm font-medium disabled:opacity-40">Повторить загрузку времени</button></div> : null}
    {!row ? <p className="text-xs text-ink-muted">Запись оформляется без онлайн-оплаты. После оформления сотрудник бизнеса свяжется с вами для согласования оплаты.</p> : null}
    {demo ? <p className="text-xs text-ink-muted">Это демонстрация: запись не сохранится.</p> : null}
    <button type="submit" disabled={!chosen || loading || pending} className={`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 ${accent.solid}`}>{pending ? 'Сохраняем…' : row ? 'Сохранить новое время' : 'Подтвердить запись'}</button>
  </form>
}
