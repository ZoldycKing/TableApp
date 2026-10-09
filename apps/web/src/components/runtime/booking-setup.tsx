'use client'

import { fieldTimeZone } from '@tableapp/schema'
import { useState } from 'react'
import { setBookingDayOffAction, setupBookingMasterAction, type BookingSetupInput } from '@/app/booking-actions'
import type { RuntimeApp } from '@/lib/app-runtime'
import { accentTones } from './ui'

const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
export function BookingSetup({ runtime, demo, onSaved }: { runtime: RuntimeApp; demo: boolean; onSaved: () => void }) {
  const config = runtime.app.booking!, accent = accentTones(runtime.app.theme.accent)
  const services = runtime.tables[config.tables.services]?.rows ?? []
  const startField = runtime.tables[config.tables.visits]?.fields.find(field => field.id === config.visit.start)
  const [input, setInput] = useState<BookingSetupInput>({ name: '', email: '', serviceIds: [], weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', breakStart: '', breakEnd: '', timeZone: startField ? fieldTimeZone(startField) : 'Europe/Moscow' })
  const [pending, setPending] = useState(false), [message, setMessage] = useState<string | null>(null)
  const [offMaster, setOffMaster] = useState(''), [offDay, setOffDay] = useState('')
  const masters = runtime.tables[config.tables.masters]?.rows ?? []
  const control = 'w-full rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm'
  return <form className="mx-auto max-w-xl space-y-5 rounded-2xl border border-sand-200 bg-white p-5 shadow-soft" onSubmit={async event => {
    event.preventDefault(); setMessage(null)
    if (demo) { setMessage('Это демонстрация. Мастер и расписание не сохраняются.'); return }
    setPending(true)
    try {
      const result = await setupBookingMasterAction(runtime.app.slug, input)
      setMessage(result.ok ? 'Мастер добавлен. Рабочие часы готовы, и он может войти по указанной почте.' : result.error)
      if (result.ok) { setInput({ ...input, name: '', email: '' }); onSaved() }
    } catch { setMessage('Не удалось сохранить настройку. Попробуйте ещё раз.') } finally { setPending(false) }
  }}>
    <p className="text-sm leading-relaxed text-ink-muted">Добавьте услуги с ценой и длительностью в разделе «Прайс», затем создайте мастера здесь. Клиенты смогут записаться на его свободное время. Другой график и отдельные выходные можно задать в разделе «Рабочее время».</p>
    <p className="text-xs text-ink-muted">Время салона: {input.timeZone}. Часовой пояс меняется в настройках колонки «Когда» в таблице «Записи».</p>
    <fieldset disabled={pending} className="space-y-4">
      <label className="block space-y-1.5 text-sm font-medium">Имя мастера<input aria-label="Имя мастера" required value={input.name} onChange={event => setInput({ ...input, name: event.target.value })} className={control} /></label>
      <label className="block space-y-1.5 text-sm font-medium">Почта мастера<input aria-label="Почта мастера" type="email" required value={input.email} onChange={event => setInput({ ...input, email: event.target.value })} className={control} /></label>
      <fieldset><legend className="mb-2 text-sm font-medium">Услуги мастера</legend><div className="space-y-2">{services.filter(row => row.data[config.service.active] === true).map(row => <label className="flex items-center gap-2 text-sm" key={row.id}>
        <input type="checkbox" checked={input.serviceIds.includes(row.id)} onChange={event => setInput({ ...input, serviceIds: event.target.checked ? [...input.serviceIds, row.id] : input.serviceIds.filter(id => id !== row.id) })} />{String(row.data[config.service.name])}
      </label>)}{!services.length ? <p className="text-sm text-ink-muted">Сначала добавьте услуги в прайс.</p> : null}</div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-medium">Рабочие дни</legend><div className="flex flex-wrap gap-3">{weekdays.map((label, day) => <label key={day} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={input.weekdays.includes(day)} onChange={event => setInput({ ...input, weekdays: event.target.checked ? [...input.weekdays, day] : input.weekdays.filter(id => id !== day) })} />{label}</label>)}</div></fieldset>
      <div className="grid grid-cols-2 gap-4">{[['start', 'Начало смены'], ['end', 'Конец смены'], ['breakStart', 'Начало перерыва'], ['breakEnd', 'Конец перерыва']].map(([key, label]) => <label key={key} className="space-y-1.5 text-sm font-medium">{label}<input aria-label={label} type="time" required={key === 'start' || key === 'end'} className={control} value={input[key as 'start']} onChange={event => setInput({ ...input, [key!]: event.target.value })} /></label>)}</div>
      <p className="text-xs text-ink-muted">Если перерыва нет, оставьте оба поля перерыва пустыми.</p>
    </fieldset>
    {message ? <p role="status" className="text-sm text-ink-muted">{message}</p> : null}
    <button type="submit" disabled={pending} className={`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 ${accent.solid}`}>{pending ? 'Сохраняем…' : 'Добавить мастера и рабочие часы'}</button>
    <div className="space-y-3 border-t border-sand-200 pt-5">
      <h2 className="text-base font-semibold">Выходной или день отпуска</h2>
      <p className="text-sm text-ink-muted">Закрывает день для новых записей. Уже принятые посещения сохраняются — их нужно перенести или отменить отдельно.</p>
      <label className="block space-y-1.5 text-sm font-medium">Мастер для выходного<select aria-label="Мастер для выходного" className={control} value={offMaster} onChange={event => setOffMaster(event.target.value)} disabled={pending}><option value="">Выберите мастера</option>{masters.map(master => <option key={master.id} value={master.id}>{String(master.data[config.master.name])}</option>)}</select></label>
      <label className="block space-y-1.5 text-sm font-medium">Дата выходного<input aria-label="Дата выходного" type="date" className={control} value={offDay} onChange={event => setOffDay(event.target.value)} disabled={pending} /></label>
      <button type="button" disabled={pending || !offMaster || !offDay} className="rounded-xl border border-sand-200 px-4 py-2.5 text-sm font-medium disabled:opacity-40" onClick={async () => {
        if (demo) { setMessage('Это демонстрация. Выходной не сохраняется.'); return }
        setPending(true); setMessage(null)
        try { const result = await setBookingDayOffAction(runtime.app.slug, offMaster, offDay); setMessage(result.ok ? 'День закрыт для новых записей.' : result.error); if (result.ok) onSaved() }
        catch { setMessage('Не удалось сохранить выходной. Попробуйте ещё раз.') } finally { setPending(false) }
      }}>Добавить выходной</button>
    </div>
  </form>
}
