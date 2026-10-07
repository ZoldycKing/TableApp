/**
 * Откуда пришло уведомление.
 *
 * У ЮKassa уведомления не подписаны — она предлагает проверять адрес
 * отправителя и спрашивать состояние платежа у неё самой. Делаем оба:
 * адрес отсекает случайный шум, а правду всё равно спрашиваем сами.
 *
 * Разбор подсетей руками: тащить библиотеку ради шести строк незачем,
 * а ошибиться в сравнении адресов легко — поэтому сравнение идёт по битам,
 * а не по тексту.
 */

/** Адреса, с которых ЮKassa шлёт уведомления. Из её документации. */
const ALLOWED = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11/32',
  '77.75.156.35/32',
  '77.75.154.128/25',
  '2a02:5180::/32',
]

/**
 * Адрес из списка провайдера.
 *
 * Разбор подсетей руками: тащить библиотеку ради шести строк незачем,
 * а ошибиться в сравнении адресов легко — поэтому сравнение идёт по битам,
 * а не по тексту.
 */
export function fromProvider(ip: string, allowed: readonly string[] = ALLOWED): boolean {
  if (!ip) return false
  return allowed.some((range) => inRange(ip, range))
}

function inRange(ip: string, range: string): boolean {
  const [network, bitsRaw] = range.split('/')
  const bits = Number(bitsRaw)
  const left = toBits(ip)
  const right = toBits(network!)
  if (!left || !right || left.length !== right.length) return false
  return left.slice(0, bits) === right.slice(0, bits)
}

/** Адрес в строку битов. IPv6 разбирается только в полном и сжатом виде. */
function toBits(ip: string): string | null {
  if (ip.includes(':')) {
    const [head, tail] = ip.split('::')
    const left = head ? head.split(':').filter(Boolean) : []
    const right = tail ? tail.split(':').filter(Boolean) : []
    if (left.length + right.length > 8) return null
    const middle = Array.from({ length: 8 - left.length - right.length }, () => '0')
    const parts = [...left, ...middle, ...right]
    return parts.map((part) => Number.parseInt(part, 16).toString(2).padStart(16, '0')).join('')
  }

  const parts = ip.split('.')
  if (parts.length !== 4) return null
  return parts
    .map((part) => {
      const value = Number(part)
      return Number.isInteger(value) && value >= 0 && value <= 255
        ? value.toString(2).padStart(8, '0')
        : null
    })
    .reduce<string | null>((acc, bits) => (acc === null || bits === null ? null : acc + bits), '')
}
