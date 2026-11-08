'use client'

import { dateInstant, fieldTimeZone, instantToWallClock, type Attachment, type Field } from '@tableapp/schema'
import { FileUpload } from '@/components/file-upload'

/*
 * Поле ввода в приложении крупнее, чем в таблице: сюда чаще тычут пальцем,
 * а не мышью, и на телефоне поле ниже 44 точек промахивается.
 */
const INPUT =
  'min-h-11 w-full rounded-xl border border-sand-300 bg-white px-3.5 py-2.5 text-base @min-[640px]:text-[15px] outline-none transition-colors placeholder:text-ink-muted focus:border-sage-400 focus:ring-4 focus:ring-sage-400/15'

function toDateInput(value: unknown, withTime: boolean, zone: string): string {
  if (!value) return ''
  const instant = dateInstant(value, zone)
  const wall = instant === null ? null : instantToWallClock(new Date(instant), zone)
  return wall ? withTime ? `${wall.date}T${wall.time}` : wall.date : ''
}

/** Поле формы в приложении. Значения хранятся в том же виде, что и в таблице. */
export function FormFieldInput({
  field,
  value,
  required,
  placeholder,
  relatedOptions,
  appId,
  disabled,
  onChange,
  onBusyChange,
}: {
  field: Field
  value: unknown
  required: boolean
  placeholder: string | null
  relatedOptions: { id: string; title: string }[]
  /** Нужен, чтобы загрузка файла от пользователя приложения попала в нужный воркспейс. */
  appId?: string
  disabled?: boolean
  onChange: (value: unknown) => void
  onBusyChange?: (busy: boolean) => void
}) {
  switch (field.type) {
    case 'attachment':
    case 'image':
      return (
        <FileUpload
          value={Array.isArray(value) ? (value as Attachment[]) : []}
          maxCount={field.options.maxCount}
          appId={appId}
          disabled={disabled}
          onChange={onChange}
          onBusyChange={onBusyChange}
        />
      )

    case 'long_text':
      return (
        <textarea
          rows={3}
          required={required}
          value={value === null || value === undefined ? '' : String(value)}
          placeholder={placeholder ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          className={INPUT}
        />
      )

    case 'checkbox':
      return (
        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-sand-300 bg-white px-3.5 py-2.5 text-[15px] transition-colors hover:border-ink/20">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
            className="size-4 accent-sage-600"
          />
          <span className="text-ink-soft">{Boolean(value) ? 'Да' : 'Нет'}</span>
        </label>
      )

    case 'number':
      return (
        <div className="space-y-1">
        <input
          type="text"
          inputMode="decimal"
          required={required}
          value={value === null || value === undefined ? '' : String(value)}
          placeholder={placeholder ?? ''}
          onChange={(event) => {
            const raw = event.target.value.trim().replace(/\s/g, '').replace(',', '.')
            if (raw === '') return onChange(null)
            const parsed = Number(raw)
            onChange(Number.isFinite(parsed) ? parsed : null)
          }}
          className={INPUT}
        />
        {field.options.initialFrom ? <p className="text-xs text-ink-muted">Оставьте пустым — при сохранении подставится цена выбранной услуги. Сохранённая цена не зависит от изменений прайса.</p> : null}
        </div>
      )

    case 'date':
    case 'datetime': {
      const withTime = field.type === 'datetime'
      return (
        <div className="space-y-1">
        <input
          type={withTime ? 'datetime-local' : 'date'}
          required={required}
          value={toDateInput(value, withTime, fieldTimeZone(field))}
          onChange={(event) => {
            const instant = dateInstant(event.target.value, fieldTimeZone(field))
            onChange(instant === null ? null : new Date(instant).toISOString())
          }}
          className={INPUT}
        />
        {withTime ? <p className="text-xs text-ink-muted">Часовой пояс: {fieldTimeZone(field)}</p> : null}
        </div>
      )
    }

    case 'single_select':
      return (
        <select
          required={required}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value || null)}
          className={INPUT}
        >
          <option value="">— не выбрано —</option>
          {field.options.choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.name}
            </option>
          ))}
        </select>
      )

    case 'multi_select': {
      const selected = new Set(Array.isArray(value) ? value.map(String) : [])
      return (
        <div className="flex flex-wrap gap-1.5">
          {field.options.choices.map((choice) => {
            const active = selected.has(choice.id)
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => {
                  const next = new Set(selected)
                  if (active) next.delete(choice.id)
                  else next.add(choice.id)
                  onChange([...next])
                }}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                  active ? 'border-sage-400 bg-sage-50 text-sage-700' : 'border-[var(--color-border-subtle)]'
                }`}
              >
                {choice.name}
              </button>
            )
          })}
        </div>
      )
    }

    case 'relation': {
      const selected = Array.isArray(value) ? value.map(String) : []
      if (!field.options.allowMultiple) {
        return (
          <select
            value={selected[0] ?? ''}
            onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
            className={INPUT}
          >
            <option value="">— не выбрано —</option>
            {relatedOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        )
      }
      return (
        <select
          multiple
          value={selected}
          onChange={(event) => onChange([...event.target.selectedOptions].map((option) => option.value))}
          className={`${INPUT} min-h-28`}
        >
          {relatedOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title}
            </option>
          ))}
        </select>
      )
    }

    default:
      return (
        <input
          type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text'}
          required={required}
          value={value === null || value === undefined ? '' : String(value)}
          placeholder={placeholder ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          className={INPUT}
        />
      )
  }
}
