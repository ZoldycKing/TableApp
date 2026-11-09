'use client'

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { builderV2FormatMoneyGrouped, builderV2MoneyInputChange } from '@/lib/builder-v2-money'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'inputMode'> & {
  value: unknown
  onValueChange: (value: string | null) => void
}

/** Grouped numeric input for currency-like App V2 fields. Stores the display string; parse on submit. */
export function BuilderV2MoneyInput({ value, onValueChange, disabled, onBlur, ...rest }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => displayOf(value))
  const pendingCaret = useRef<number | null>(null)

  useEffect(() => {
    if (document.activeElement === input.current) return
    setText(displayOf(value))
  }, [value])

  useEffect(() => {
    if (pendingCaret.current == null || !input.current) return
    input.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
    pendingCaret.current = null
  }, [text])

  return <input
    {...rest}
    ref={input}
    type="text"
    inputMode="numeric"
    autoComplete="off"
    disabled={disabled}
    value={text}
    onChange={event => {
      const next = builderV2MoneyInputChange(event.target.value, event.target.selectionStart ?? event.target.value.length)
      if (!next) return
      pendingCaret.current = next.caret
      setText(next.text)
      onValueChange(next.text || null)
    }}
    onBlur={event => {
      if (typeof value === 'number' && Number.isFinite(value)) setText(builderV2FormatMoneyGrouped(value))
      else if (typeof value === 'string' && value.trim()) {
        const next = builderV2MoneyInputChange(value, value.length)
        if (next) setText(next.text)
      }
      onBlur?.(event)
    }}
  />
}

function displayOf(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return builderV2FormatMoneyGrouped(value)
  if (typeof value === 'string') return value
  return ''
}
