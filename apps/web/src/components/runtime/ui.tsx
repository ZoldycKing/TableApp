'use client'

import type { Field } from '@tableapp/schema'
import type { ReactNode } from 'react'
import { CHOICE_COLORS } from '@/components/views/card'
import { formatCell } from '@/lib/format'
import { Icon, type IconName } from './icons'

/**
 * Мелкие части оформления приложения.
 *
 * Собраны в одном месте не ради переиспользования, а ради единообразия:
 * статус должен выглядеть одинаково в списке, в карточке и в плитке, иначе
 * человек каждый раз заново соображает, на что он смотрит.
 */

export { accentTones } from './accent-tones'

const AVATAR_TONES = [
  'bg-sage-100 text-sage-700',
  'bg-blue-100 text-blue-700',
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
  'bg-rose-100 text-rose-700',
]

/** Инициалы из имени, а если его нет — из адреса почты. */
function initials(name: string | null, email: string): string {
  const source = (name ?? email.split('@')[0] ?? '').replace(/[._-]+/g, ' ').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

/** Цвет кружка устойчив к перезагрузке: он выводится из самого адреса. */
function tone(seed: string): string {
  let sum = 0
  for (const char of seed) sum = (sum + char.charCodeAt(0)) % 997
  return AVATAR_TONES[sum % AVATAR_TONES.length]!
}

export function Avatar({
  name,
  email,
  size = 'm',
}: {
  name: string | null
  email: string
  size?: 's' | 'm' | 'l'
}) {
  const box = size === 's' ? 'size-8 text-[11px]' : size === 'l' ? 'size-14 text-lg' : 'size-9 text-xs'
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${box} ${tone(email)}`}
    >
      {initials(name, email)}
    </span>
  )
}

/**
 * Значение поля выбора плашкой.
 *
 * До этого статус в приложении рисовался обычным текстом, хотя в таблице
 * он уже был цветным. Из-за этого список заявок выглядел выпиской, а не
 * рабочим экраном: глазу не за что зацепиться.
 */
export function StatusPill({ field, value }: { field: Field; value: unknown }) {
  if (field.type !== 'single_select' && field.type !== 'multi_select') return null

  const ids = Array.isArray(value) ? value : value ? [value] : []
  if (ids.length === 0) return null

  return (
    <span className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const choice = field.options.choices.find((candidate) => candidate.id === id)
        if (!choice) return null
        return (
          <span
            key={String(id)}
            className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
              CHOICE_COLORS[choice.color] ?? CHOICE_COLORS.gray
            }`}
          >
            {choice.name}
          </span>
        )
      })}
    </span>
  )
}

/** Отметка «да/нет»: галочка заметнее слова и не занимает строку. */
export function CheckMark({ value }: { value: unknown }) {
  /*
   * Со словом, а не одним значком.
   *
   * Пустой кружок рядом с «Оплачен» читался как угодно: то ли галочку
   * забыли поставить, то ли она стоит, то ли по ней можно нажать. Отметка
   * отвечает на вопрос «да или нет», и ответ должен быть написан.
   */
  return value ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      <Icon name="check" className="size-3" />
      Да
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-sand-100 px-2 py-0.5 text-xs font-medium text-ink-muted">
      Нет
    </span>
  )
}

/** Короткий текст значения — там, где плашка и галочка не подходят. */
export function plainValue(field: Field, value: unknown): string {
  return formatCell(field, value)
}

/**
 * Пустой экран.
 *
 * Раньше здесь была строка «Здесь пока пусто» посередине белого поля —
 * человек не понимал, сломалось оно или так задумано. Теперь видно,
 * что экран работает, и сказано, что делать дальше.
 */
export function EmptyState({
  icon = 'inbox',
  title,
  hint,
  action,
}: {
  icon?: IconName
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-sand-100 text-ink-muted">
        <Icon name={icon} className="size-7" />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-ink">{title}</p>
      {hint ? <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-ink-muted">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

/** Приветствие по времени суток: мелочь, от которой экран становится живым. */
export function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('ru-RU', { hour: 'numeric', hour12: false, timeZone: 'Europe/Moscow' }).format(now),
  )
  if (hour < 5) return 'Доброй ночи'
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'
  return 'Добрый вечер'
}

/** Имя, которым обращаемся к вошедшему: имя, а если его нет — часть адреса. */
export function viewerName(name: string | null, email: string): string {
  if (name?.trim()) return name.trim().split(/\s+/)[0]!
  const local = email.split('@')[0] ?? ''
  const cleaned = local.replace(/[._-]+/g, ' ').trim()
  return cleaned ? cleaned[0]!.toUpperCase() + cleaned.slice(1) : 'вам'
}
