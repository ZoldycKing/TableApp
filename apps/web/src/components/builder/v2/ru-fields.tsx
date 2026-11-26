import type { ComponentProps } from 'react'
import { DateField, TimeField } from '@/components/ui/pickers'

/** Calendar date as `дд.мм.гггг`, independent of the browser locale. */
export const ruDateText = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : ''
}

/** Instant as `дд.мм.гггг` in the given zone, independent of the browser locale. */
export const ruNumericDate = (value: Date, timeZone: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone }).format(value)

/** Clock time as `чч:мм`, without an AM/PM marker. */
export const ruTimeText = (value: string) => {
  const match = /^(\d{2}):(\d{2})/.exec(value)
  return match ? `${match[1]}:${match[2]}` : ''
}

type FieldProps = Omit<ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  value: string
  onValue: (value: string) => void
}

/** Custom calendar. The stored value stays `YYYY-MM-DD`; the face reads `дд.мм.гггг`. */
export function RuDateInput({ value, onValue, 'aria-label': ariaLabel, min, max, disabled, id, name, required, className }: FieldProps) {
  return (
    <DateField
      label={typeof ariaLabel === 'string' ? ariaLabel : 'Дата'}
      value={value}
      onValue={onValue}
      min={typeof min === 'string' ? min : undefined}
      max={typeof max === 'string' ? max : undefined}
      disabled={disabled}
      id={id}
      name={name}
      required={required}
      className={typeof className === 'string' ? className : undefined}
    />
  )
}

/** Custom 24-hour clock. No native time input. */
export function RuTimeInput({ value, onValue, 'aria-label': ariaLabel, disabled, id, name, className }: FieldProps) {
  return (
    <TimeField
      label={typeof ariaLabel === 'string' ? ariaLabel : 'Время'}
      value={value}
      onValue={onValue}
      disabled={disabled}
      id={id}
      name={name}
      className={typeof className === 'string' ? className : undefined}
    />
  )
}
