export type BuilderV2MessengerKind = 'telegram' | 'whatsapp' | 'max' | 'other'

export type BuilderV2MessengerLink = {
  id: string
  kind: BuilderV2MessengerKind
  label: string
  value: string
  href?: string
  copyOnly?: boolean
}

const MESSENGER_FIELD = /^(?:telegram|whatsapp|max|другой мессенджер|контакт другого мессенджера)$/iu

export function builderV2IsMessengerFieldName(name: string) {
  return MESSENGER_FIELD.test(name.trim())
}

function digitsPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  return digits
}

function telegramHref(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const user = trimmed.replace(/^@/, '')
  if (/^[A-Za-z][\w]{3,31}$/.test(user)) return `https://t.me/${user}`
  const phone = digitsPhone(trimmed)
  if (phone.length >= 10) return `https://t.me/+${phone}`
}

function whatsappHref(value: string) {
  const phone = digitsPhone(value)
  if (phone.length >= 10) return `https://wa.me/${phone}`
}

/** MAX has no stable public chat URL for arbitrary contacts — copy value instead. */
function maxHref(value: string) {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
}

export function builderV2MessengerLinks(input: {
  telegram?: string | null
  whatsapp?: string | null
  max?: string | null
  otherLabel?: string | null
  otherValue?: string | null
}): BuilderV2MessengerLink[] {
  const links: BuilderV2MessengerLink[] = []
  const telegram = input.telegram?.trim()
  if (telegram) {
    const href = telegramHref(telegram)
    links.push({ id: 'telegram', kind: 'telegram', label: 'Telegram', value: telegram, href, copyOnly: !href })
  }
  const whatsapp = input.whatsapp?.trim()
  if (whatsapp) {
    const href = whatsappHref(whatsapp)
    links.push({ id: 'whatsapp', kind: 'whatsapp', label: 'WhatsApp', value: whatsapp, href, copyOnly: !href })
  }
  const max = input.max?.trim()
  if (max) {
    const href = maxHref(max)
    links.push({ id: 'max', kind: 'max', label: 'MAX', value: max, href, copyOnly: !href })
  }
  const otherLabel = input.otherLabel?.trim()
  const otherValue = input.otherValue?.trim()
  if (otherValue) {
    const href = /^https?:\/\//i.test(otherValue) ? otherValue : undefined
    links.push({
      id: 'other',
      kind: 'other',
      label: otherLabel || 'Другой',
      value: otherValue,
      href,
      copyOnly: !href,
    })
  }
  return links
}

/** Pull messenger values from a record using table field names. */
export function builderV2MessengersFromRecord(
  values: Record<string, unknown>,
  fields: readonly { id: string; name: string }[],
) {
  const byName = (re: RegExp) => {
    const field = fields.find(item => re.test(item.name.trim()))
    if (!field) return ''
    const raw = values[field.id]
    return typeof raw === 'string' ? raw : raw == null ? '' : String(raw)
  }
  return builderV2MessengerLinks({
    telegram: byName(/^telegram$/i),
    whatsapp: byName(/^whatsapp$/i),
    max: byName(/^max$/i),
    otherLabel: byName(/^другой мессенджер$/i),
    otherValue: byName(/^контакт другого мессенджера$/i),
  })
}
