'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { calendarDay } from '@tableapp/schema'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { BOOKING_WEEKDAYS, bookingSchedulePlan, type BookingScheduleAdapter, type BookingScheduleInput, type BookingScheduleRead, type BookingScheduleRequest } from '@/lib/builder-v2-booking-schedule'
import { usePublishedV2 } from './published-context'
import css from './booking.module.css'
import scroll from './scroll-overflow.module.css'
import { useScrollOverflow } from './scroll-overflow'
import { Checkbox } from '@/components/ui/choice'
import { Select } from '@/components/ui/select'
import { RuDateInput, RuTimeInput } from './ru-fields'
import styles from '../prototype/prototype.module.css'

export const BookingScheduleDemoContext = createContext<BookingScheduleAdapter | null>(null)

export function BookingScheduleForm({ app, screenId, formId, recordId, editing = false, onSaved }: { app: AppV2; screenId: string; formId: string; recordId?: string; editing?: boolean; onSaved: () => void }) {
  const config = app.booking!, published = usePublishedV2(), demo = useContext(BookingScheduleDemoContext)
  const [read, setRead] = useState<BookingScheduleRead>(), [retry, setRetry] = useState(0), [pending, setPending] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false), [stale, setStale] = useState(false), [notice, setNotice] = useState('')
  const [input, setInput] = useState<BookingScheduleInput>({ masterId: '', mode: 'weekly', weekdays: [1, 2, 3, 4, 5], date: '', start: '09:00', end: '18:00', closed: false, breakStart: '', breakEnd: '' })
  const [withBreak, setWithBreak] = useState(false)
  const attempt = useRef<BookingScheduleRequest | null>(null)
  const modeRow = useRef<HTMLDivElement>(null)
  useScrollOverflow(modeRow, [input.mode])
  const key = JSON.stringify([app.id, screenId, formId, recordId, published?.revision, retry])
  useEffect(() => {
    let cancelled = false
    setRead(undefined); setError(''); setStale(false); setUncertain(false); attempt.current = null
    const scope = { screenId, formId, ...(recordId ? { recordId } : {}) }
    const load = async () => {
      if (demo) return demo.read(scope)
      const actions = await import('@/app/builder-v2-booking-actions')
      return published ? actions.readPublishedV2BookingScheduleAction(published.slug, { ...scope, revision: published.revision }) : actions.readBuilderV2BookingScheduleAction(app.id, app, scope)
    }
    void load().then(result => {
      if (cancelled) return
      setRead(result)
      if (result.ok) {
        const values = result.state.values, fields = config.schedule, weekday = config.weekdays.indexOf(String(values[fields.weekday])), date = calendarDay(values[fields.date]) ?? '', selectedMaster = values[fields.master]
        setInput({ masterId: Array.isArray(selectedMaster) ? String(selectedMaster[0] ?? '') : '', mode: date ? 'date' : 'weekly', weekdays: recordId && weekday >= 0 ? [weekday] : [1, 2, 3, 4, 5], date, start: String(values[fields.start] || '09:00'), end: String(values[fields.end] || '18:00'), closed: values[fields.closed] === true, breakStart: '', breakEnd: '' })
      }
    }).catch(() => { if (!cancelled) setRead({ ok: false, error: 'Не удалось открыть рабочие часы. Попробуйте ещё раз.' }) })
    return () => { cancelled = true }
  }, [key])
  const change = (patch: Partial<BookingScheduleInput>) => { setInput(value => ({ ...value, ...patch })); setError(''); setNotice(''); attempt.current = null }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending || !read?.ok || editing || stale) return
    const master = read.state.masters.find(master => master.id === input.masterId)
    const plan = bookingSchedulePlan(config, { ...input, ...(!withBreak ? { breakStart: '', breakEnd: '' } : {}) }, master?.name ?? '')
    if (!master || !plan.ok) { setError(!master ? 'Выберите мастера.' : !plan.ok ? plan.error : 'Проверьте рабочие часы.'); return }
    if (!published && !demo) { setNotice('Рабочие часы заполнены верно. В предпросмотре они не сохраняются.'); return }
    attempt.current ??= { screenId, formId, ...(recordId ? { recordId } : {}), revision: read.state.revision, fingerprint: read.state.fingerprint, requestId: `schedule_${crypto.randomUUID().replaceAll('-', '')}`, input: { ...input, ...(!withBreak ? { breakStart: '', breakEnd: '' } : {}) } }
    setPending(true); setError('')
    try {
      const result = demo ? await demo.save(attempt.current) : await (await import('@/app/builder-v2-booking-actions')).savePublishedV2BookingScheduleAction(published!.slug, attempt.current)
      if (result.ok) { published?.refresh('Рабочие часы сохранены.'); onSaved() }
      else { setError(result.error); setUncertain(Boolean(result.uncertain)); setStale(Boolean(result.stale)); if (!result.uncertain) attempt.current = null }
    } catch { setError('Не удалось подтвердить сохранение. Повторите запрос.'); setUncertain(true) }
    finally { setPending(false) }
  }
  return <form className={css.scheduleForm} onSubmit={submit} aria-label={recordId ? 'Изменить рабочие часы' : 'Добавить рабочие часы'} aria-busy={pending || !read} noValidate>
    <div className={css.scheduleScroll}>
    <div className={css.formIntro}><h2>{recordId ? 'Изменить рабочие часы' : 'Рабочие часы мастера'}</h2><p>{recordId ? 'Измените этот период. Другие периоды останутся без изменений.' : 'Выберите рабочие дни и задайте одинаковые часы для всех выбранных дней.'}</p></div>
    {!read ? <><p className="sr-only" role="status">Загружаем мастеров…</p><div className={css.scheduleSkeleton} aria-hidden="true"><span /><span /><i /><div>{BOOKING_WEEKDAYS.map(day => <b key={day.value} />)}</div><em /><em /></div></> : !read.ok ? <div role="alert"><p>{read.error}</p><button type="button" className={styles.secondary} onClick={() => setRetry(value => value + 1)}>Попробовать ещё раз</button></div> : <>
      <fieldset className={css.scheduleFields} disabled={pending || editing || stale || uncertain}>
        <Select label="Мастер" value={input.masterId} onValue={masterId => change({ masterId })} options={[{ value: '', label: 'Выберите мастера' }, ...read.state.masters.map(master => ({ value: master.id, label: master.name }))]} />
        {!read.state.masters.length && <p className={css.timeHint}>Сначала добавьте мастера в разделе «Мастера».</p>}
        <div ref={modeRow} className={`${css.switch} ${scroll.row}`} role="group" aria-label="Когда действует график"><button type="button" aria-pressed={input.mode === 'weekly'} onClick={() => change({ mode: 'weekly' })}>По дням недели</button><button type="button" aria-pressed={input.mode === 'date'} onClick={() => change({ mode: 'date' })}>На дату</button></div>
        {input.mode === 'weekly' ? <fieldset className={css.weekdayField}><legend>Рабочие дни</legend><div className={css.weekdayChoices}>{BOOKING_WEEKDAYS.map(day => <Checkbox key={day.value} label={day.name} checked={input.weekdays.includes(day.value)} onChecked={checked => change({ weekdays: checked ? [...input.weekdays, day.value] : input.weekdays.filter(value => value !== day.value) })} />)}</div></fieldset> : <label className={css.scheduleLabel}>Дата<RuDateInput value={input.date} onValue={date => change({ date })} /><small>Эти часы заменят обычный график на выбранную дату.</small></label>}
        <Checkbox label="Выходной" checked={input.closed} onChecked={closed => change({ closed })} />
        {!input.closed && <><div className={css.scheduleTimes}><label className={css.scheduleLabel}>Начало работы<RuTimeInput value={input.start} onValue={start => change({ start })} /></label><label className={css.scheduleLabel}>Окончание работы<RuTimeInput value={input.end} onValue={end => change({ end })} /></label></div>{!recordId && <><Checkbox label="Добавить перерыв" checked={withBreak} onChecked={checked => { setWithBreak(checked); change({ breakStart: checked ? '13:00' : '', breakEnd: checked ? '14:00' : '' }) }} />{withBreak && <div className={css.scheduleTimes}><label className={css.scheduleLabel}>Начало перерыва<RuTimeInput value={input.breakStart} onValue={breakStart => change({ breakStart })} /></label><label className={css.scheduleLabel}>Конец перерыва<RuTimeInput value={input.breakEnd} onValue={breakEnd => change({ breakEnd })} /></label></div>}</>}</>}
      </fieldset>
    </>}
    </div>
    {(read?.ok || !read) && <div className={css.scheduleFooter}>
      {error && <p role="alert" className={css.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
      {stale ? <button type="button" className={styles.secondary} onClick={() => setRetry(value => value + 1)}>Обновить рабочие часы</button> : <button type="submit" className={styles.primary} disabled={pending || editing || !read}>{pending ? 'Сохраняем…' : uncertain ? 'Повторить сохранение' : 'Сохранить рабочие часы'}</button>}
    </div>}
  </form>
}
