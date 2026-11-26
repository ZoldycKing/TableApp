'use client'

import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react'
import { useId, useRef, useState } from 'react'
import { useDismiss } from './dismiss'
import css from './ui.module.css'

export type SelectOption = { value: string; label: string }

export function Select({
  label, value, options, onValue, placeholder = 'Выберите', disabled = false, name,
}: {
  label: string
  value: string
  options: SelectOption[]
  onValue: (value: string) => void
  placeholder?: string
  disabled?: boolean
  name?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()
  useDismiss(open, root, () => setOpen(false))
  const current = options.find(option => option.value === value)
  return (
    <div className={css.stack} ref={root}>
      <span className={css.label} id={`${listId}-label`}>{label}</span>
      <div className={css.anchor}>
        <button
          type="button"
          className={css.trigger}
          data-empty={current ? undefined : true}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={`${listId}-label`}
          disabled={disabled}
          onClick={() => setOpen(currentOpen => !currentOpen)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setOpen(true)
            }
          }}
        >
          <span>{current?.label ?? placeholder}</span>
          <CaretDownIcon size={14} aria-hidden />
        </button>
        {name ? <input type="hidden" name={name} value={value} /> : null}
        {open ? (
          <ul className={css.panel} id={listId} role="listbox" aria-labelledby={`${listId}-label`}>
            {options.map(option => (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  className={css.option}
                  aria-selected={option.value === value}
                  onClick={() => { onValue(option.value); setOpen(false) }}
                >
                  <span>{option.label}</span>
                  {option.value === value ? <CheckIcon size={14} aria-hidden /> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
