import type { InputHTMLAttributes, ReactNode } from 'react'
import css from './ui.module.css'

export function TextField({
  label, hint, error, mono = false, id, ...props
}: {
  label: string
  hint?: string
  error?: string
  mono?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { id?: string }) {
  const fieldId = id ?? props.name
  return (
    <label className={css.stack} htmlFor={fieldId}>
      <span className={css.label}>{label}</span>
      <input id={fieldId} className={`${css.field} ${mono ? css.mono : ''}`} aria-invalid={error ? true : undefined} aria-describedby={hint || error ? `${fieldId}-hint` : undefined} {...props} />
      {hint || error ? <span className={css.hint} id={`${fieldId}-hint`}>{error || hint}</span> : null}
    </label>
  )
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className={css.label}>{children}</span>
}
