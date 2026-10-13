/**
 * Иконки приложения.
 *
 * Свои, а не библиотека: набор нужен маленький, а лишняя зависимость тянет
 * в клиентскую сборку тысячи неиспользуемых путей. Все нарисованы в одной
 * сетке 24×24 линией 1.6 — иначе в меню они выглядят собранными с миру
 * по нитке.
 */

const PATHS: Record<string, string> = {
  list: 'M4 7h16M4 12h16M4 17h10',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  plus: 'M12 5v14M5 12h14',
  home: 'M4 10.5 12 4l8 6.5M6 9.5V20h12V9.5',
  box: 'M4 8.5 12 4l8 4.5M4 8.5V16l8 4.5L20 16V8.5M4 8.5 12 13l8-4.5M12 13v7.5',
  users: 'M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11ZM3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5M16 11.2a3 3 0 0 0 0-5.9M17.5 14.9c2 .6 3.4 2.3 3.4 4.6',
  calendar: 'M5 6.5h14v13H5zM5 10.5h14M9 4v3M15 4v3',
  tag: 'M4 11.2V5h6.2l9 9-6.2 6.2-9-9ZM8 8.5h.01',
  wrench: 'M14.8 6.2a3.8 3.8 0 0 0 4.9 4.9l-8.6 8.6a2.1 2.1 0 0 1-3-3l8.6-8.6a3.8 3.8 0 0 0-1.9-1.9Z',
  truck: 'M3 7h11v9H3zM14 10.5h3.6L21 14v2h-7M7 19a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 7 19ZM17.5 19a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z',
  inbox: 'M4 13.5 6 5h12l2 8.5V19H4zM4 13.5h4.5l1 2.5h5l1-2.5H20',
  clipboard: 'M9 5H7v15h10V5h-2M9 5V3.8h6V5M9 5h6M9.5 11h5M9.5 15h3',
  deal: 'M4.5 10.5 12 4l7.5 6.5M7 14.5h4M7 17.5h7M6 20V10.8M18 20V10.8',
  chart: 'M4 20V4M4 20h16M8 17V11M12.5 17V7.5M17 17v-4',
  file: 'M13.5 4H7v16h10V8l-3.5-4ZM13.5 4v4H17M9.5 13h5M9.5 16.5h3',
  check: 'M5 12.5 9.5 17 19 7.5',
  chat: 'M20 12.2c0 3.8-3.6 6.9-8 6.9-1 0-2-.2-2.9-.5L4 20l1.3-3.3A6.5 6.5 0 0 1 4 12.2c0-3.8 3.6-6.9 8-6.9s8 3.1 8 6.9Z',
  bell: 'M12 4.5a5 5 0 0 0-5 5c0 4-1.5 5.5-1.5 5.5h13S17 13.5 17 9.5a5 5 0 0 0-5-5ZM10.3 18.3a2 2 0 0 0 3.4 0',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM16.2 16.2 20 20',
  mail: 'M4 6h16v12H4zM4 6l8 6 8-6',
  phone: 'M7 4H4.5c-.7 0-1 .6-1 1.3.2 8.2 6.2 14.2 14.4 14.4.7 0 1.3-.3 1.3-1V16l-4-1.5-1.6 2a12.3 12.3 0 0 1-6.2-6.2l2-1.6L7 4Z',
  refresh: 'M19.5 9A8 8 0 0 0 6 5.5L3.5 8M3.5 4v4h4M4.5 15A8 8 0 0 0 18 18.5l2.5-2.5M20.5 20v-4h-4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 10.5v6M12 7.5h.01',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  back: 'M14 6l-6 6 6 6',
  monitor: 'M4 5.5h16v10.5H4zM9.5 20h5M12 16v4',
  smartphone: 'M8 3.5h8v17H8zM10.8 18.2h2.4',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.5 12a7.5 7.5 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.4 7.4 0 0 0-2-1.2l-.3-2.5h-4l-.3 2.5c-.7.3-1.4.7-2 1.2l-2.3-1-2 3.4 2 1.5a7.5 7.5 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1c.6.5 1.3.9 2 1.2l.3 2.5h4l.3-2.5c.7-.3 1.4-.7 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z',
}

export type IconName = keyof typeof PATHS | (string & {})

export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  const path = PATHS[name] ?? PATHS.list!

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Есть ли такая иконка: чтобы подставить запасную осознанно, а не молча. */
export function hasIcon(name: string): boolean {
  return name in PATHS
}

export const ICON_NAMES = Object.keys(PATHS)
