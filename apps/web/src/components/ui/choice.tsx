'use client'

import { CheckIcon } from '@phosphor-icons/react'
import css from './ui.module.css'

export function Checkbox({
  checked, onChecked, label, disabled = false, labelHidden = false,
}: {
  checked: boolean
  onChecked: (checked: boolean) => void
  label: string
  disabled?: boolean
  /** Keep the name for assistive tech without printing it beside the box. */
  labelHidden?: boolean
}) {
  return (
    <button type="button" role="checkbox" className={css.choice} aria-checked={checked} disabled={disabled} onClick={() => onChecked(!checked)}>
      <span className={css.box} aria-hidden>{checked ? <CheckIcon size={12} weight="bold" /> : null}</span>
      {labelHidden ? <span className={css.srOnly}>{label}</span> : label}
    </button>
  )
}

export function Switch({
  checked, onChecked, label, disabled = false,
}: {
  checked: boolean
  onChecked: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button type="button" role="switch" className={css.switch} aria-checked={checked} disabled={disabled} onClick={() => onChecked(!checked)}>
      <span className={css.switchTrack} aria-hidden><span className={css.knob} /></span>
      {label}
    </button>
  )
}
