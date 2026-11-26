'use client'

import css from './ui.module.css'

export function Tabs({
  label, value, options, onValue,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onValue: (value: string) => void
}) {
  return (
    <div className={css.tabs} role="tablist" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="tab"
          className={css.tab}
          aria-selected={option.value === value}
          onClick={() => onValue(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
