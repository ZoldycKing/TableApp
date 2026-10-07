import type { SVGProps } from 'react'

/**
 * Свой набор иконок.
 *
 * Правила, выведенные после первой версии: не больше пяти элементов, крупные
 * формы, ничего ближе 4 единиц к краю. Мелкая деталь на сорока пикселях
 * превращается в грязь — лучше сказать меньше, но внятно.
 */

type IconProps = SVGProps<SVGSVGElement>

const base = {
  width: 40,
  height: 40,
  viewBox: '0 0 40 40',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** Один файл расползся на три копии. */
export function IconScatteredCopies(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="11" width="15" height="20" rx="2.5" opacity="0.3" />
      <rect x="10" y="8" width="15" height="20" rx="2.5" opacity="0.55" />
      <rect x="15" y="5" width="20" height="26" rx="3" fill="white" />
      <path d="M20 13h10M20 18h7" className="text-sage-600" />
      <circle cx="33" cy="30" r="3.5" className="fill-clay-400 stroke-none" />
    </svg>
  )
}

/** Ячейка с формулой треснула. */
export function IconCrackedFormula(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="9" width="30" height="22" rx="3" />
      <path d="M5 17h30" opacity="0.4" />
      <path d="M20 9v8" opacity="0.4" />
      <path d="M10 13.5h4" opacity="0.55" />
      <path d="M25 13.5h5" opacity="0.55" />
      <path d="M17 17l-2.5 5.5h5.5L16 31" className="text-clay-500" strokeWidth="2.4" />
    </svg>
  )
}

/** Таблица не помещается в телефон и торчит за края. */
export function IconPhoneOverflow(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 16h32M4 24h32" className="text-clay-500" strokeWidth="2.2" opacity="0.85" />
      <rect x="12" y="5" width="16" height="30" rx="4" fill="white" />
      <path d="M17.5 9h5" />
      <path d="M12 16h16M12 24h16" opacity="0.35" />
      <path d="M20 16v8" opacity="0.35" />
    </svg>
  )
}

/** Цифры из нескольких файлов сводят в один отчёт руками. */
export function IconManualReport(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="6" width="12" height="15" rx="2" opacity="0.45" />
      <rect x="4" y="24" width="12" height="11" rx="2" opacity="0.45" />
      <path d="M16 13.5h5M16 29.5h5" className="text-clay-500" strokeWidth="2" />
      <rect x="21" y="10" width="15" height="21" rx="3" fill="white" />
      <path d="M25 17h7M25 22h7M25 27h4" className="text-sage-600" />
    </svg>
  )
}

/** Истории изменений нет. */
export function IconNoHistory(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="20" cy="20" r="14" />
      <path d="M20 11.5V20l6 3.5" strokeWidth="2.2" />
      <path d="M9 9l22 22" className="text-clay-500" strokeWidth="2.6" />
    </svg>
  )
}

/** Клиенту отправляют скриншот вместо доступа. */
export function IconScreenshots(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="8" width="23" height="17" rx="3" />
      <path d="M4 12l11.5 7.5L27 12" opacity="0.45" />
      <rect x="17" y="21" width="19" height="14" rx="3" fill="white" />
      <path d="M17 32l5-4.5 3.5 3 3-2.5L36 33" className="text-clay-500" strokeWidth="1.9" />
      <circle cx="22" cy="26" r="1.6" className="fill-clay-400 stroke-none" />
    </svg>
  )
}

/** Файл втягивается в таблицу: импорт. */
export function IconImport(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20 4v13" className="text-sage-600" strokeWidth="2.4" />
      <path d="M15 12l5 5 5-5" className="text-sage-600" strokeWidth="2.4" />
      <rect x="5" y="21" width="30" height="14" rx="3" />
      <path d="M5 27h30" opacity="0.4" />
      <path d="M15 27v8M25 27v8" opacity="0.4" />
    </svg>
  )
}

/** Воронка наводит порядок. */
export function IconFunnelOrder(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 9h30L24 21v11l-8 4V21L5 9z" />
      <circle cx="12" cy="5" r="1.8" className="fill-sage-400 stroke-none" />
      <circle cx="20" cy="4.5" r="1.8" className="fill-clay-400 stroke-none" />
      <circle cx="28" cy="5" r="1.8" className="fill-sage-500 stroke-none" />
    </svg>
  )
}

/** Таблица становится приложением. */
export function IconPublish(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="9" width="14" height="19" rx="2.5" />
      <path d="M4 15h14" opacity="0.4" />
      <path d="M18 18.5h5" className="text-clay-500" strokeWidth="2.2" />
      <path d="M20.5 15.5l3 3-3 3" className="text-clay-500" strokeWidth="2.2" />
      <rect x="25" y="5" width="11" height="27" rx="3.5" className="text-sage-600" strokeWidth="1.9" fill="white" />
      <path d="M29 9h3" className="text-sage-600" />
    </svg>
  )
}

/** Разные типы данных в колонках. */
export function IconFieldTypes(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="6" width="30" height="28" rx="3" />
      <path d="M17 6v28" opacity="0.4" />
      <path d="M5 15h30M5 25h30" opacity="0.4" />
      <path d="M9 10.5h4" />
      <path d="M9 20h4" className="text-sage-600" strokeWidth="2.2" />
      <path d="M8.5 29.5l2 2 3-3.5" className="text-sage-600" strokeWidth="2.2" />
      <path d="M21 10.5h10M21 20h7M21 29.5h10" opacity="0.45" />
    </svg>
  )
}

/** Из полей получается значение. */
export function IconFormulaFlow(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="6" width="10" height="8" rx="2" />
      <rect x="4" y="26" width="10" height="8" rx="2" />
      <path d="M14 10c8 0 5 10 11 10M14 30c8 0 5-10 11-10" className="text-sage-600" strokeWidth="1.9" />
      <circle cx="30" cy="20" r="6.5" className="text-sage-600" strokeWidth="2" fill="white" />
      <path d="M27.5 23.5c0-5 .8-7 2.5-7M27 20h5" className="text-sage-600" strokeWidth="1.7" />
    </svg>
  )
}

/** Связь двух таблиц. */
export function IconRelations(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="6" width="13" height="16" rx="2.5" />
      <rect x="23" y="18" width="13" height="16" rx="2.5" />
      <path d="M17 14c7 0 3 12 6 12" className="text-sage-600" strokeWidth="2" />
      <circle cx="17" cy="14" r="2.4" className="fill-sage-500 stroke-none" />
      <circle cx="23" cy="26" r="2.4" className="fill-sage-500 stroke-none" />
    </svg>
  )
}

/** Одни данные — четыре формы. */
export function IconViews(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4" width="14" height="14" rx="2.5" />
      <path d="M4 11h14M11 4v14" opacity="0.45" />
      <rect x="22" y="4" width="14" height="14" rx="2.5" className="text-sage-600" />
      <rect x="25" y="7" width="3.5" height="8" rx="1.2" className="fill-sage-200 stroke-none" />
      <rect x="30.5" y="7" width="3.5" height="5" rx="1.2" className="fill-sage-400 stroke-none" />
      <rect x="4" y="22" width="14" height="14" rx="2.5" />
      <path d="M4 27h14" opacity="0.45" />
      <circle cx="8.5" cy="31.5" r="1.6" className="fill-clay-400 stroke-none" />
      <rect x="22" y="22" width="14" height="14" rx="2.5" />
      <path d="M22 32l4.5-4.5 3 2.5 3-2.5L36 31" className="text-sage-600" strokeWidth="1.8" />
    </svg>
  )
}

/** Приложение собирается из блоков. */
export function IconBuilder(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="10" y="4" width="18" height="32" rx="4" />
      <rect x="13.5" y="9" width="11" height="6" rx="1.8" className="fill-sage-200 stroke-none" />
      <rect x="13.5" y="18" width="11" height="3" rx="1.2" opacity="0.5" />
      <rect x="13.5" y="24" width="7" height="3" rx="1.2" opacity="0.5" />
      <rect x="28" y="19" width="9" height="7" rx="2.2" className="text-clay-500" strokeWidth="2" fill="white" />
    </svg>
  )
}

/** Строка под замком. */
export function IconRowAccess(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="7" width="32" height="26" rx="3" />
      <path d="M4 16h32M4 25h32" opacity="0.4" />
      <path d="M8 11.5h10M8 20.5h13" opacity="0.5" />
      <rect x="22" y="25" width="12" height="9" rx="2.5" className="text-sage-600" strokeWidth="2" fill="white" />
      <path d="M25 25v-2.5a3 3 0 016 0V25" className="text-sage-600" strokeWidth="2" />
    </svg>
  )
}

/** Выездные работы: гаечный ключ и точка на карте. */
export function IconFieldWork(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 33l10-10" strokeWidth="2.4" />
      <path d="M17 23a8 8 0 1010-10l-4 4-3.5-.5-.5-3.5 4-4A8 8 0 0017 23z" strokeWidth="1.9" fill="white" />
      <path d="M34 28c0 3.5-4 7-4 7s-4-3.5-4-7a4 4 0 018 0z" className="text-clay-500" strokeWidth="1.9" fill="white" />
      <circle cx="30" cy="28" r="1.4" className="fill-clay-500 stroke-none" />
    </svg>
  )
}

/** Торговля: коробка с ценником. */
export function IconCommerce(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 13l15-7 15 7-15 7-15-7z" />
      <path d="M5 13v14l15 7 15-7V13" />
      <path d="M20 20v14" opacity="0.4" />
      <path d="M27 31l6-6v-5h-5l-6 6" className="text-clay-500" strokeWidth="1.9" fill="white" />
      <circle cx="30" cy="23" r="1.5" className="fill-clay-500 stroke-none" />
    </svg>
  )
}

/** Личный кабинет: карточка клиента и ключ. */
export function IconClientPortal(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="8" width="23" height="24" rx="3" />
      <circle cx="13" cy="17" r="4" className="text-sage-600" strokeWidth="1.9" />
      <path d="M7 27c1.3-3.3 3.5-5 6-5s4.7 1.7 6 5" className="text-sage-600" strokeWidth="1.9" />
      <circle cx="31" cy="19" r="4.5" className="text-clay-500" strokeWidth="2" fill="white" />
      <path d="M31 23.5V32M28.5 29h5" className="text-clay-500" strokeWidth="2" />
    </svg>
  )
}

/** Внутренний учёт: планшет с отметками. */
export function IconRegistry(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="8" y="6" width="24" height="30" rx="3" />
      <path d="M15 6V4.5A1.5 1.5 0 0116.5 3h7A1.5 1.5 0 0125 4.5V6" />
      <path d="M13.5 15l2.5 2.5 4.5-5" className="text-sage-600" strokeWidth="2.2" />
      <path d="M13.5 25l2.5 2.5 4.5-5" className="text-sage-600" strokeWidth="2.2" />
      <path d="M24 15h4M24 25h4" opacity="0.45" />
    </svg>
  )
}

/** Рукописное подчёркивание: дорисовывается при загрузке. */
export function Underline({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 16"
      preserveAspectRatio="none"
      aria-hidden
      className={`underline-draw absolute -bottom-2 left-0 h-4 w-full ${className}`}
    >
      <path
        d="M3 11.5c46-5.5 104-8 160-7 38 .7 78 2.6 134 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        pathLength={1}
      />
    </svg>
  )
}
