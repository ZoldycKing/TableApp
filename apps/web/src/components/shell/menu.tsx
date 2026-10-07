'use client'

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * Выпадающее меню.
 *
 * Одно на переключатель пространства и на меню учётной записи: у них
 * одинаковые обязательства — Escape закрывает и возвращает внимание,
 * щелчок мимо закрывает, кнопка говорит о своём состоянии. Писать это дважды
 * значит однажды забыть половину в одном из мест.
 *
 * Рисуется **в конце страницы, а не внутри панели**. Учётная запись стоит
 * у самого низа боковой панели, и меню, открытое вниз внутри неё, уезжало
 * за нижний край окна: человек видел верхнюю строчку и всё. Панель к тому же
 * умеет прятаться и обрезает содержимое по себе — из неё меню не показать
 * никак. Поэтому положение считается по месту кнопки на экране, а само меню
 * живёт отдельно.
 */

/**
 * Пока меню открыто, панель не должна уезжать.
 *
 * Панель, выехавшую по наведению, забирает уход курсора. Но курсор уходит
 * и когда человек тянется к пункту меню — и меню исчезает у него из-под руки.
 * Открытое меню эту уборку придерживает.
 */
const HoverLock = createContext<(locked: boolean) => void>(() => {})

export const HoverLockProvider = HoverLock.Provider

export type Placement = 'top' | 'bottom'

/** Отступ от края окна и зазор между кнопкой и меню. */
const EDGE = 8
const GAP = 6

export function Menu({
  label,
  trigger,
  children,
  placement = 'bottom',
  align = 'start',
  minWidth = 220,
}: {
  /** Что говорит кнопка тем, кто её не видит. */
  label: string
  trigger: (open: boolean) => ReactNode
  children: (close: () => void) => ReactNode
  /** Куда открывать в первую очередь. Не помещается — перевернётся само. */
  placement?: Placement
  align?: 'start' | 'end'
  minWidth?: number
}) {
  const [open, setOpen] = useState(false)
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const lock = useContext(HoverLock)

  useEffect(() => setMounted(true), [])

  const close = () => {
    setOpen(false)
    setSpot(null)
  }

  useEffect(() => {
    lock(open)
    return () => lock(false)
  }, [open, lock])

  /*
   * Место считаем после отрисовки, но до показа: размеры меню заранее
   * неизвестны — в нём может быть два пункта, а может быть десять
   * пространств.
   */
  useLayoutEffect(() => {
    if (!open) return

    const place = () => {
      const t = button.current?.getBoundingClientRect()
      const p = panel.current?.getBoundingClientRect()
      if (!t || !p) return

      const vw = window.innerWidth
      const vh = window.innerHeight

      const above = t.top - p.height - GAP
      const below = t.bottom + GAP

      // Сначала туда, куда просили; не помещается — в другую сторону;
      // не помещается нигде — прижимаем к краю, но за экран не уводим.
      let top = placement === 'top' ? above : below
      if (placement === 'top' && above < EDGE) top = below
      if (placement === 'bottom' && below + p.height > vh - EDGE) top = above
      top = Math.min(Math.max(top, EDGE), Math.max(vh - p.height - EDGE, EDGE))

      let left = align === 'end' ? t.right - p.width : t.left
      left = Math.min(Math.max(left, EDGE), Math.max(vw - p.width - EDGE, EDGE))

      setSpot({ top, left })
    }

    place()
    // Страница под меню может уехать: считаем заново, а не оставляем
    // меню висеть там, где кнопки уже нет.
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, placement, align])

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      close()
      // Возвращаем внимание туда, откуда его забрали: иначе после Escape
      // клавиатура оказывается в начале страницы.
      button.current?.focus()
    }

    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      // Меню лежит вне кнопки, поэтому проверяем оба: иначе щелчок
      // по самому меню его же и закроет.
      if (button.current?.contains(target) || panel.current?.contains(target)) return
      close()
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? close() : setOpen(true))}
        className="w-full rounded-xl text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sage-400"
      >
        {trigger(open)}
      </button>

      {open && mounted
        ? createPortal(
            <div
              ref={panel}
              role="menu"
              style={{
                position: 'fixed',
                top: spot?.top ?? 0,
                left: spot?.left ?? 0,
                minWidth,
                // До подсчёта места меню уже в разметке — иначе нечего мерить,
                // — но не видно: иначе оно мигает в левом верхнем углу.
                visibility: spot ? 'visible' : 'hidden',
              }}
              className="z-[60] max-h-[70vh] overflow-y-auto rounded-xl border border-sand-200 bg-white p-1 shadow-soft"
            >
              {children(close)}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/** Строка меню. Всегда кнопка или ссылка — щёлкать по `div` нечем с клавиатуры. */
export const MENU_ITEM =
  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink-soft outline-none transition-colors hover:bg-sand-100 hover:text-ink focus-visible:bg-sand-100 focus-visible:text-ink'
