'use client'

import { durationUnitLabel, joinMinutes, splitMinutes, type DurationUnit } from './format'
import { Select } from './select'
import { TextField } from './field'
import css from './ui.module.css'

export function DurationField({
  label, amountLabel = 'Число', minutes, onMinutes, hint,
}: {
  label: string
  amountLabel?: string
  minutes: number
  onMinutes: (minutes: number) => void
  hint?: string
}) {
  const parts = splitMinutes(Number.isFinite(minutes) ? minutes : 0)
  const options = (['min', 'hour', 'day'] as DurationUnit[]).map(unit => ({
    value: unit,
    label: durationUnitLabel(unit, parts.amount),
  }))
  return (
    <div className={css.stack}>
      <span className={css.label}>{label}</span>
      <div className={css.duration}>
        <TextField
          label={amountLabel}
          mono
          inputMode="numeric"
          value={String(parts.amount)}
          onChange={event => {
            const amount = Number(event.target.value)
            if (event.target.value === '' || Number.isNaN(amount)) return
            onMinutes(joinMinutes(amount, parts.unit))
          }}
        />
        <Select label="Единица" value={parts.unit} options={options} onValue={unit => onMinutes(joinMinutes(parts.amount, unit as DurationUnit))} />
      </div>
      {hint ? <span className={css.hint}>{hint}</span> : null}
    </div>
  )
}
