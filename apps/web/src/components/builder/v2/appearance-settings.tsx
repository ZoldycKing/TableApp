'use client'
import { useEffect, useRef, useState } from 'react'
import type {AppV2} from '@tableapp/schema/app-v2'
import { builderV2LogoUrl, BUILDER_V2_LOGO_MAX_BYTES, BUILDER_V2_LOGO_MIME } from '@/lib/builder-v2-logo-types'
import {ProtoIcon} from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'
import shell from './app-frame.module.css'
import {BUILDER_V2_COLORS,BUILDER_V2_ICONS} from './appearance'
import { BuilderV2AppMark } from './app-frame'
import { SHOP_LOW_STOCK_THRESHOLD } from '@/lib/builder-v2-shop-stock'
import { BOOKING_SLOT_STEPS, bookingRules, type BookingSlotStep } from '@/lib/booking-rules'

function BookingRulesSettings({ app, onChange }: { app: AppV2; onChange: (app: AppV2) => void }) {
  const booking = app.booking
  if (!booking) return null
  const rules = bookingRules(booking)
  const [lead, setLead] = useState(String(rules.leadMinutes))
  const [horizon, setHorizon] = useState(String(rules.horizonDays))
  const [buffer, setBuffer] = useState(String(rules.bufferMinutes))
  const [deadline, setDeadline] = useState(String(rules.cancelDeadlineHours))
  useEffect(() => {
    setLead(String(rules.leadMinutes))
    setHorizon(String(rules.horizonDays))
    setBuffer(String(rules.bufferMinutes))
    setDeadline(String(rules.cancelDeadlineHours))
  }, [rules.leadMinutes, rules.horizonDays, rules.bufferMinutes, rules.cancelDeadlineHours])
  const save = (patch: Partial<NonNullable<AppV2['booking']>>) => {
    if (!app.booking) return
    const next = { ...app.booking, ...patch }
    if (patch.slotStepMinutes) next.stepMinutes = patch.slotStepMinutes
    if (patch.minLeadMinutes !== undefined) next.leadMinutes = patch.minLeadMinutes
    onChange({ ...app, booking: next })
  }
  const number = (raw: string, min: number, max: number) => {
    if (!/^\d+$/.test(raw)) return null
    const value = Number(raw)
    return value >= min && value <= max ? value : null
  }
  return <fieldset className={shell.logoField} aria-label="Правила записи">
    <legend>Правила записи</legend>
    <label>Шаг слотов
      <select aria-label="Шаг слотов" value={rules.stepMinutes} onChange={event => save({ slotStepMinutes: Number(event.target.value) as BookingSlotStep })}>
        {BOOKING_SLOT_STEPS.map(step => <option key={step} value={step}>{step} мин</option>)}
      </select>
    </label>
    <p className={ui.hint}>Свободное время предлагается с этим интервалом.</p>
    <label>Не раньше чем за, минут
      <input aria-label="Не раньше чем за" type="number" min="0" max="10080" step="1" value={lead} onChange={event => {
        setLead(event.target.value)
        const value = number(event.target.value, 0, 10080)
        if (value !== null) save({ minLeadMinutes: value })
      }} />
    </label>
    <p className={ui.hint}>Клиент не увидит время ближе этого срока.</p>
    <label>Не дальше чем на, дней
      <input aria-label="Не дальше чем на" type="number" min="1" max="365" step="1" value={horizon} onChange={event => {
        setHorizon(event.target.value)
        const value = number(event.target.value, 1, 365)
        if (value !== null) save({ horizonDays: value })
      }} />
    </label>
    <p className={ui.hint}>Дальше этого срока записаться нельзя.</p>
    <label>Буфер после приёма, минут
      <input aria-label="Буфер после приёма" type="number" min="0" max="240" step="1" value={buffer} onChange={event => {
        setBuffer(event.target.value)
        const value = number(event.target.value, 0, 240)
        if (value !== null) save({ bufferMinutes: value })
      }} />
    </label>
    <p className={ui.hint}>Следующая запись к этому мастеру начнётся не раньше конца буфера. В сетке видна длительность услуги.</p>
    <label>Отмена не позднее чем за, часов
      <input aria-label="Отмена не позднее чем за" type="number" min="0" max="720" step="1" value={deadline} onChange={event => {
        setDeadline(event.target.value)
        const value = number(event.target.value, 0, 720)
        if (value !== null) save({ cancelDeadlineHours: value })
      }} />
    </label>
    <p className={ui.hint}>0 — клиент может отменить до начала визита. Администратор в сетке дня не ограничен.</p>
  </fieldset>
}

function ShopStockSettings({ app, onChange }: { app: AppV2; onChange: (app: AppV2) => void }) {
  const threshold = app.shop?.lowStockThreshold ?? SHOP_LOW_STOCK_THRESHOLD
  const [value, setValue] = useState(String(threshold))
  const [invalid, setInvalid] = useState(false)
  useEffect(() => { setValue(String(threshold)); setInvalid(false) }, [threshold])
  return <fieldset className={shell.logoField}>
    <legend>Остатки в каталоге</legend>
    <label>Показывать количество, когда осталось меньше
      <input type="number" min="1" max="1000000" step="1" value={value} aria-invalid={invalid} aria-describedby="shop-stock-hint"
        onChange={event => {
          const raw = event.target.value
          setValue(raw)
          const number = Number(raw)
          const valid = raw !== '' && Number.isInteger(number) && number >= 1 && number <= 1000000
          setInvalid(!valid)
          if (valid && app.shop) onChange({ ...app, shop: { ...app.shop, lowStockThreshold: number } })
        }} onBlur={() => { if (invalid) { setValue(String(threshold)); setInvalid(false) } }} />
    </label>
    <p id="shop-stock-hint" className={ui.hint}>{invalid ? 'Введите целое число от 1 до 1 000 000.' : threshold > 1 ? `При остатке ${threshold - 1} шт. покупатель увидит «Осталось ${threshold - 1} шт.». При остатке ${threshold} и более — «В наличии».` : 'При любом положительном остатке покупатель увидит «В наличии».'}</p>
  </fieldset>
}

export function BuilderV2IconPicker({value,onChange,label}:{value:string;onChange:(value:string)=>void;label:string}) {
  return <label>{label}<span className={shell.iconField}><span aria-hidden><ProtoIcon name={value}/></span><select value={value} onChange={event=>onChange(event.target.value)}>{!BUILDER_V2_ICONS.some(([id])=>id===value)&&<option value={value}>Текущая иконка</option>}{BUILDER_V2_ICONS.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></span></label>
}
export function BuilderV2AppearanceSettings({ app, onChange, onScreens, onUploadLogo, onLogoPending }: {
  app: AppV2; onChange: (app: AppV2) => void; onScreens: () => void; onLogoPending?: (pending: boolean) => void
  onUploadLogo: (form: FormData) => Promise<{ ok: true; key: string } | { ok: false; error: string }>
}) {
  const current = useRef({ app, onChange, onLogoPending })
  current.current = { app, onChange, onLogoPending }
  const generation = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => () => { generation.current++; current.current.onLogoPending?.(false) }, [])

  const appearance: NonNullable<AppV2['appearance']> = app.appearance ?? { navigation: 'bottom', icon: 'apps' }
  const setAppearance = (patch: Partial<NonNullable<AppV2['appearance']>>) => onChange({ ...app, appearance: { ...appearance, ...patch } })
  const logo = builderV2LogoUrl(app, true)
  const setLogo = (key: string | null) => {
    const latest = current.current
    latest.onChange({ ...latest.app, theme: { ...latest.app.theme, logoKey: key } })
  }
  const upload = async (file: File) => {
    setError('')
    if (file.size > BUILDER_V2_LOGO_MAX_BYTES) { setError('Максимальный размер логотипа — 2 МБ.'); return }
    const request = ++generation.current
    const body = new FormData()
    body.set('file', file)
    setPending(true)
    current.current.onLogoPending?.(true)
    try {
      const result = await onUploadLogo(body)
      if (generation.current !== request) return
      if (result.ok) setLogo(result.key)
      else setError(result.error)
    } catch {
      if (generation.current === request) setError('Не удалось загрузить логотип. Попробуйте ещё раз.')
    } finally {
      if (generation.current === request) {
        setPending(false)
        current.current.onLogoPending?.(false)
      }
    }
  }
  return <div className={styles.inspectorContent}>
    <div className={styles.inspectorHeading}><span className={styles.elementMark}><ProtoIcon name="palette"/></span><div><span>Всё приложение</span><h2>Оформление</h2></div></div>
    <fieldset className={shell.logoField} disabled={pending}>
      <legend>Логотип приложения</legend>
      <div className={shell.logoHint}>
        {logo && <BuilderV2AppMark logo={logo} icon={appearance.icon} />}
        <p className={ui.hint}>PNG, JPEG или WebP до 2 МБ.</p>
      </div>
      <input ref={fileInput} type="file" hidden accept={BUILDER_V2_LOGO_MIME.join(',')} onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void upload(file)
      }} />
      {pending && <p role="status" className={ui.hint}>Загружаем логотип…</p>}
      {error && <p role="alert" className={ui.dataError}>{error}</p>}
      <div className={shell.logoActions}>
        <button type="button" className={styles.secondary} onClick={() => fileInput.current?.click()}>{logo ? 'Заменить' : 'Загрузить логотип'}</button>
        {logo && <button type="button" className={styles.textButton} onClick={() => { setError(''); setLogo(null) }}>Убрать логотип</button>}
      </div>
    </fieldset>
    {!logo && <BuilderV2IconPicker label="Иконка приложения" value={appearance.icon} onChange={icon=>setAppearance({ icon })}/>}
    <label>Тема<select value={app.theme.scheme} onChange={event=>onChange({...app,theme:{...app.theme,scheme:event.target.value as AppV2['theme']['scheme']}})}><option value="light">Светлая</option><option value="dark">Тёмная</option><option value="auto">Как на устройстве</option></select></label>
    <fieldset className={shell.colorField}><legend>Цвет приложения</legend><div className={shell.swatches}>{Object.entries(BUILDER_V2_COLORS).map(([id,[name,color]])=><button type="button" key={id} aria-label={`Цвет: ${name}`} title={name} aria-pressed={app.theme.accent===id} style={{'--swatch':color} as React.CSSProperties} onClick={()=>onChange({...app,theme:{...app.theme,accent:id as AppV2['theme']['accent']}})}>{app.theme.accent===id&&<ProtoIcon name="check"/>}</button>)}</div></fieldset>
    <label>Вид на компьютере<select value={appearance.presentation ?? 'workspace'} onChange={event=>setAppearance({ presentation: event.target.value === 'centered' ? 'centered' : 'workspace' })}><option value="workspace">Рабочее пространство</option><option value="centered">По центру с нижним меню</option></select></label>
    {appearance.presentation !== 'centered' && <label>Меню на компьютере<select value={appearance.navigation} onChange={event=>setAppearance({ navigation: event.target.value as typeof appearance.navigation })}><option value="sidebar">Сбоку</option><option value="tabs">Сверху</option><option value="bottom">Снизу</option></select></label>}
    <label>Плотность списка<select value={appearance.density ?? 'regular'} onChange={event => setAppearance({ density: event.target.value === 'compact' ? 'compact' : 'regular' })}><option value="regular">Обычная</option><option value="compact">Компактная</option></select></label>
    <label>Скругление<select value={appearance.corners ?? 'rounded'} onChange={event => setAppearance({ corners: event.target.value === 'subtle' ? 'subtle' : 'rounded' })}><option value="rounded">Обычное</option><option value="subtle">Минимальное</option></select></label>
    <p className={ui.hint}>На телефоне меню находится снизу. Изменения видны здесь сразу, а пользователям — после публикации.</p>
    {app.shop && <ShopStockSettings app={app} onChange={onChange} />}
    {app.booking && <BookingRulesSettings app={app} onChange={onChange} />}
    <button type="button" className={styles.secondary} onClick={onScreens}>Настроить разделы<ProtoIcon name="arrow"/></button>
  </div>
}
