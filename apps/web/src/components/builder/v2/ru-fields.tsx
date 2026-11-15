import type { ComponentProps } from 'react'
import css from './ru-fields.module.css'

/** Calendar date as `дд.мм.гггг`, independent of the browser locale. */
export const ruDateText = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : ''
}

/** Clock time as `чч:мм`, without an AM/PM marker. */
export const ruTimeText = (value: string) => {
  const match = /^(\d{2}):(\d{2})/.exec(value)
  return match ? `${match[1]}:${match[2]}` : ''
}

type FieldProps = Omit<ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  value: string
  onValue: (value: string) => void
}

/** Native picker, with the value painted in a fixed Russian format. */
function LocaleField({ kind, value, text, onValue, ...props }: FieldProps & { kind: 'date' | 'time'; text: string }) {
  return (
    <span className={css.wrap}>
      <input
        {...props}
        type={kind}
        value={value}
        onChange={event => {
          if (kind === 'date' && !event.target.value) return
          onValue(event.target.value)
        }}
      />
      <span className={css.readout} data-empty={text ? undefined : true} aria-hidden="true">{text || (kind === 'date' ? 'дд.мм.гггг' : 'чч:мм')}</span>
    </span>
  )
}

export function RuDateInput({ value, onValue, ...props }: FieldProps) {
  return <LocaleField kind="date" value={value} text={ruDateText(value)} onValue={onValue} {...props} />
}

export function RuTimeInput({ value, onValue, ...props }: FieldProps) {
  return <LocaleField kind="time" value={value} text={ruTimeText(value)} onValue={onValue} {...props} />
}
