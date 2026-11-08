import { BarcodeIcon, CalendarBlankIcon, EnvelopeSimpleIcon, HashIcon, ListBulletsIcon, MapPinIcon, PhoneIcon, ReceiptIcon, TagIcon, UserIcon } from '@phosphor-icons/react/ssr'
import presentation from './app-presentation.module.css'

const namedIcons = [
  [/^(?:артикул|штрих[ -]?код|sku|barcode)(?:[\s,.:_()-]|$)/iu, BarcodeIcon],
  [/^(?:код|id|code|идентификатор)(?:[\s,.:_()-]|$)/iu, HashIcon],
  [/^(?:телефон|мобильный|phone|tel)(?:[\s,.:_()-]|$)/iu, PhoneIcon],
  [/^(?:почта|электронная почта|e-?mail)(?:[\s,.:_()-]|$)/iu, EnvelopeSimpleIcon],
  [/^(?:город|адрес|city|address)(?:[\s,.:_()-]|$)/iu, MapPinIcon],
  [/^(?:категория|category)(?:[\s,.:_()-]|$)/iu, TagIcon],
  [/^(?:дата|date)(?:[\s,.:_()-]|$)/iu, CalendarBlankIcon],
  [/^(?:имя|фио|клиент|покупатель|customer|client|name)(?:[\s,.:_()-]|$)/iu, UserIcon],
  [/^(?:номер заказа|№\s*заказа|order number)(?:[\s,.:_()-]|$)/iu, ReceiptIcon],
] as const

function fieldIcon(label: string, field?: { name: string; type: string }) {
  if (field?.type === 'phone') return PhoneIcon
  if (field?.type === 'email') return EnvelopeSimpleIcon
  if (field?.type === 'date' || field?.type === 'datetime') return CalendarBlankIcon
  return namedIcons.find(([pattern]) => pattern.test(label.trim()))?.[1]
    ?? namedIcons.find(([pattern]) => pattern.test(field?.name.trim() ?? ''))?.[1]
    ?? ListBulletsIcon
}

export function RecordFieldLabel({ label, field, as: Tag = 'dt', showIcon = true }: {
  label: string
  field?: { name: string; type: string }
  as?: 'dt' | 'small' | 'span'
  showIcon?: boolean
}) {
  const Mark = showIcon ? fieldIcon(label, field) : null
  return <Tag className={presentation.fieldLabel}>
    {Mark ? <Mark size={14} aria-hidden /> : null}<span>{label}</span>
  </Tag>
}
