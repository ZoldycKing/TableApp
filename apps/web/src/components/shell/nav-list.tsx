'use client'

import Link from 'next/link'
import { NAV_GROUPS, activeNavId, navItemsFor, type NavItem } from '@/lib/platform-nav'
import { ShellIcon } from './icons'
import { LABEL, LABEL_MOTION, ONLY_WIDE_BLOCK, ROW, type ShellVariant } from './variant'

/**
 * Список разделов.
 *
 * Один на все три вида панели: развёрнутую, свёрнутую и выдвижную
 * на телефоне. Разница между ними — подписи и ширина, а не набор пунктов
 * и не правила подсветки.
 */
export function NavList({
  pathname,
  role,
  variant = 'wide',
  onNavigate,
  omitIds = [],
  contextName,
}: {
  pathname: string
  role: string
  variant?: ShellVariant
  /** Выдвижная панель закрывается после перехода: иначе она перекрывает то,
   *  ради чего её открыли. */
  onNavigate?: () => void
  omitIds?: readonly string[]
  contextName?: string
}) {
  const items = navItemsFor(role).filter(item => !omitIds.includes(item.id))
  const active = activeNavId(pathname, items)

  return (
    <nav aria-label="Разделы платформы" className="space-y-5">
      {NAV_GROUPS.map((group) => {
        const inGroup = items.filter((item) => item.group === group.id)
        if (inGroup.length === 0) return null

        return (
          <div key={group.id}>
            {/*
              Заголовок группы прячем в свёрнутом виде, а не заменяем линией:
              на 64 пикселях «Пространство» всё равно не прочитать, а лишняя
              черта делает панель полосатой.
            */}
            <p
              title={contextName && group.id === 'work' ? contextName : undefined}
              className={`mb-1 truncate px-3 text-[11px] font-medium text-ink-muted ${contextName ? '' : 'uppercase tracking-wide'} ${ONLY_WIDE_BLOCK[variant]}`}
            >
              {contextName ? group.id === 'work' ? `Бизнес: ${contextName}` : 'Настройки бизнеса' : group.label}
            </p>

            <ul className="space-y-0.5">
              {inGroup.map((item) => (
                <li key={item.id}>
                  <NavLink
                    item={item}
                    active={item.id === active}
                    variant={variant}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

function NavLink({
  item,
  active,
  variant,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  variant: ShellVariant
  onNavigate?: () => void
}) {
  /*
   * Подсветка открытого раздела — лёгкая заливка и чуть более плотный текст,
   * без сплошной цветной плашки. Плашка во весь пункт кричит громче самого
   * содержимого страницы, ради которого человек сюда и пришёл.
   */
  const tone = active
    ? 'bg-sage-50 font-medium text-ink'
    : 'text-ink-soft hover:bg-sand-100 hover:text-ink'

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      // Читающим с экрана нужно знать не «эта ссылка подсвечена»,
      // а «вы находитесь здесь».
      aria-current={active ? 'page' : undefined}
      /*
       * Подсказка системная, а не своя.
       *
       * Своя всплывающая здесь не нужна: полоска разворачивается и от
       * наведения, и от перехода клавишей, и подпись появляется целиком
       * через 140 мс. Подсказка успела бы мигнуть и смениться панелью —
       * это хуже, чем её отсутствие. Системная остаётся для устройства,
       * которое сообщает о себе «курсора нет»: там разворота по наведению
       * не будет, и она — единственное, что объясняет значок.
       */
      title={item.label}
      className={`flex h-10 items-center gap-2.5 rounded-xl text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sage-400 ${ROW[variant]} ${tone}`}
    >
      <ShellIcon name={item.icon} className={`size-[18px] shrink-0 ${active ? 'text-sage-700' : ''}`} />
      {/* Подпись сжимается до нуля вместе с панелью, но из разметки
          не исчезает: читающим с экрана она нужна в любом виде. */}
      <span className={`${LABEL_MOTION} ${LABEL[variant]}`}>{item.label}</span>

    </Link>
  )
}
