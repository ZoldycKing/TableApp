'use client'

import { fieldTimeZone, type App } from '@tableapp/schema'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { setupOwnerBookingMasterAction } from '@/app/owner-booking-actions'
import type { BookingSetupInput } from '@/app/booking-actions'
import type { RuntimeTable } from '@/lib/app-runtime'
import { ownerInput, ownerPrimary, OwnerField } from './owner-ui'
import { useUnsaved } from '@/lib/unsaved'

const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
export function OwnerBookingSetup({ app, tables, userId }: { app: App; tables: Record<string, RuntimeTable>; userId: string }) {
  const config = app.booking!
  const services = tables[config.tables.services]?.rows.filter(row => row.data[config.service.active] === true) ?? []
  const startField = tables[config.tables.visits]?.fields.find(field => field.id === config.visit.start)
  const defaults: BookingSetupInput = { name: '', email: '', serviceIds: [], weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', breakStart: '', breakEnd: '', timeZone: startField ? fieldTimeZone(startField) : 'Europe/Moscow' }
  const [input, setInput] = useState(defaults)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const [pending, transition] = useTransition()
  const submitting = useRef(false)
  const router = useRouter()
  const dirty = JSON.stringify(input) !== JSON.stringify(defaults)
  const draftKey = `tableapp:owner-schedule:${userId}:${app.workspaceId}:${app.id}`
  const [restored, setRestored] = useState(false)
  const [storageAvailable, setStorageAvailable] = useState(true)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey)
      if (raw) {
        const value = JSON.parse(raw) as BookingSetupInput
        if (value && ['name', 'email', 'start', 'end', 'breakStart', 'breakEnd', 'timeZone'].every(key => typeof value[key as keyof BookingSetupInput] === 'string') && Array.isArray(value.serviceIds) && value.serviceIds.every(id => typeof id === 'string') && Array.isArray(value.weekdays) && value.weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6)) setInput({ ...value, serviceIds: value.serviceIds.filter(id => services.some(service => service.id === id)), timeZone: defaults.timeZone })
      }
    } catch { setStorageAvailable(false) }
    setRestored(true)
  }, [draftKey])
  useEffect(() => {
    if (!restored) return
    try { if (dirty) sessionStorage.setItem(draftKey, JSON.stringify(input)); else sessionStorage.removeItem(draftKey) } catch { setStorageAvailable(false) }
  }, [restored, draftKey, dirty, input])
  useEffect(() => {
    if (!dirty || storageAvailable) return
    const unload = (event: BeforeUnloadEvent) => event.preventDefault()
    const leave = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (link && !window.confirm('Черновик графика не удалось сохранить в браузере. Перейти и отменить введённые данные?')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', unload); document.addEventListener('click', leave, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', leave, true) }
  }, [dirty, storageAvailable])
  useUnsaved(`owner-schedule:${app.id}`, dirty)
  const patch = (value: Partial<BookingSetupInput>) => { setInput(current => ({ ...current, ...value })); setMessage(null) }
  return <form className="max-w-2xl space-y-5 rounded-2xl border border-sand-200 bg-white p-5 sm:p-6" aria-busy={pending} onSubmit={event => {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setMessage(null)
    transition(async () => {
      try {
        const result = await setupOwnerBookingMasterAction(app.id, input)
        if (!result.ok) { setMessage({ error: true, text: result.error }); return }
        setMessage({ error: false, text: 'Мастер и рабочие часы сохранены. Рабочая роль добавлена в черновик; проверьте и опубликуйте приложение.' })
        setInput(defaults)
        router.refresh()
      } catch { setMessage({ error: true, text: 'Не удалось сохранить мастера. Введённые данные остались в форме — повторите сохранение.' }) }
      finally { submitting.current = false }
    })
  }}>
    <h3 className="text-lg font-semibold">Добавьте мастера и график</h3>
    <p className="text-sm leading-6 text-ink-soft">Имя увидят клиенты. По указанной почте мастер сможет войти в рабочее приложение после публикации. Приглашение на почту сейчас не отправляется.</p>
    <fieldset disabled={pending || !restored} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><OwnerField label="Имя мастера"><input required maxLength={100} className={ownerInput} value={input.name} onChange={event => patch({ name: event.target.value })} /></OwnerField><OwnerField label="Почта мастера"><input type="email" required maxLength={254} className={ownerInput} value={input.email} onChange={event => patch({ email: event.target.value })} /></OwnerField></div>
      <fieldset><legend className="mb-3 text-sm font-medium">Какие услуги оказывает</legend><div className="space-y-2">{services.map(row => <label key={row.id} className="flex min-h-9 items-center gap-3 text-sm"><input type="checkbox" checked={input.serviceIds.includes(row.id)} onChange={event => patch({ serviceIds: event.target.checked ? [...input.serviceIds, row.id] : input.serviceIds.filter(id => id !== row.id) })} className="size-4 shrink-0" />{String(row.data[config.service.name] ?? 'Услуга')} · {String(row.data[config.service.minutes] ?? '')} мин</label>)}</div>{!services.length ? <p className="text-sm leading-6 text-ink-soft">Сначала добавьте доступные услуги с ценой и длительностью на шаге «Ваши данные».</p> : null}</fieldset>
      <fieldset><legend className="mb-3 text-sm font-medium">Рабочие дни</legend><div className="flex flex-wrap gap-2">{days.map((day, index) => <label key={day} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-sand-200 px-3 text-sm"><input type="checkbox" checked={input.weekdays.includes(index)} onChange={event => patch({ weekdays: event.target.checked ? [...input.weekdays, index] : input.weekdays.filter(day => day !== index) })} />{day}</label>)}</div></fieldset>
      <div className="grid grid-cols-2 gap-4"><OwnerField label="Начало смены"><input required type="time" value={input.start} onInput={event => patch({ start: event.currentTarget.value })} className={ownerInput} /></OwnerField><OwnerField label="Конец смены"><input required type="time" value={input.end} onInput={event => patch({ end: event.currentTarget.value })} className={ownerInput} /></OwnerField></div>
      <details><summary className="cursor-pointer rounded text-sm font-medium focus-visible:ring-2 focus-visible:ring-sage-400">Добавить перерыв</summary><div className="mt-4 grid grid-cols-2 gap-4"><OwnerField label="Начало перерыва"><input type="time" value={input.breakStart} onInput={event => patch({ breakStart: event.currentTarget.value })} className={ownerInput} /></OwnerField><OwnerField label="Конец перерыва"><input type="time" value={input.breakEnd} onInput={event => patch({ breakEnd: event.currentTarget.value })} className={ownerInput} /></OwnerField></div><p className="mt-2 text-xs text-ink-muted">Без перерыва оставьте оба поля пустыми.</p></details>
    </fieldset>
    <p className="text-xs leading-5 text-ink-muted">Часовой пояс: {input.timeZone}. Отдельные даты, выходные и изменения существующего графика доступны в таблице «Рабочее время».</p>
    {dirty ? <p className="text-xs leading-5 text-ink-muted">{storageAvailable ? 'Ввод сохраняется в этой вкладке при переходе между шагами.' : 'Хранение черновика в браузере недоступно. Сохраните данные перед переходом.'} Чтобы данные появились в бизнесе, нажмите «Сохранить мастера и график».</p> : null}
    {message ? <p role={message.error ? 'alert' : 'status'} className={`text-sm leading-6 ${message.error ? 'text-red-700' : 'text-sage-700'}`}>{message.text}</p> : null}
    <button type="submit" className={ownerPrimary} disabled={pending || !restored || !services.length}>{pending ? 'Сохраняем…' : 'Сохранить мастера и график'}</button>
  </form>
}
