'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '@/components/runtime/icons'
import { DEVICES, type Device } from '@/lib/demo-view'
import { useViewTransition } from '@/components/motion/use-view-transition'

/**
 * Витрина демонстрации: панель управления и рамка, в которой живёт приложение.
 *
 * Два переключателя — роль и размер экрана — и одно приложение между ними.
 * В этом весь смысл страницы: показать, что «кабинет клиента» и «рабочее место
 * диспетчера» — не два продукта, а одно приложение и разные права.
 *
 * Второго приложения для компьютера здесь нет и быть не может. Рантайм
 * смотрит на ширину **своего места**, а не окна, поэтому достаточно поменять
 * ширину рамки: в 1280 точек он сам разворачивает боковое меню, в 390 —
 * нижние вкладки. Переключатель ниже только меняет ширину.
 */

/**
 * Размеры рамок.
 *
 * Ширина компьютера выбрана не на глаз: рабочая область получается 976 точек,
 * а сводке нужно от 900, чтобы разложить числа в один ряд. Уже — и приложение
 * покажет планшетную раскладку, выдав её за десктопную.
 */
const FRAMES: Record<Device, { width: number; height: number; bezel: number }> = {
  desktop: { width: 1280, height: 720, bezel: 0 },
  mobile: { width: 390, height: 780, bezel: 12 },
}

const DEVICE_NAMES: Record<Device, string> = {
  desktop: 'Компьютер',
  mobile: 'Телефон',
}

const DEVICE_ICONS: Record<Device, string> = {
  desktop: 'monitor',
  mobile: 'smartphone',
}

/** Роли перестают помещаться плашками примерно на седьмой. */
const MAX_PILLS = 6

export function DemoStage({
  roles,
  activeRole,
  initialDevice,
  deviceChosen,
  description,
  children,
}: {
  roles: readonly { id: string; name: string }[]
  activeRole: string
  initialDevice: Device
  /** Размер выбран человеком (он есть в адресе), а не подставлен по умолчанию. */
  deviceChosen: boolean
  /** Карточка «что видит эта роль». Собирается на сервере, здесь только место. */
  description: ReactNode
  /** Само приложение. Приходит с сервера уже отобранным по правам. */
  children: ReactNode
}) {
  const [device, setDevice] = useState<Device>(initialDevice)
  const { change } = useViewTransition()
  const frameName = `tableapp-demo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  /*
   * Компьютерный вид на телефоне.
   *
   * Уменьшенный до четверти он нечитаем, и выдавать его за рабочее
   * представление нечестно. Поэтому даём отдельный режим: приложение
   * в натуральную величину, прокрутка внутри окна поверх страницы.
   * Само приложение при этом остаётся тем же и на том же месте в дереве —
   * иначе оно пересоздалось бы и потеряло открытый раздел.
   */
  const [expanded, setExpanded] = useState(false)
  const router = useRouter()

  /*
   * Крупный просмотр — это диалог, и вести себя должен как диалог: закрываться
   * по Escape, принимать фокус при открытии и возвращать его на ту же кнопку
   * при закрытии. Иначе человек, пришедший с клавиатуры, оказывается внутри
   * слоя, из которого нечем выйти, а фокус остаётся под ним на странице.
   */
  const opener = useRef<HTMLButtonElement | null>(null)
  const closer = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!expanded) return
    closer.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      // Возврат фокуса здесь, а не в обработчике кнопки: закрыть можно
      // и кнопкой, и клавишей, и оба пути должны вернуть его одинаково.
      opener.current?.focus()
    }
  }, [expanded])

  /*
   * Пришли с телефона и размер не выбирали — показываем телефон. Уменьшенное
   * до четверти окно компьютера на телефоне разглядеть нельзя, а витрина
   * должна начинаться с того, что видно. Выбор человека при этом не трогаем:
   * он записан в адрес, и его мы уважаем.
   */
  useLayoutEffect(() => {
    if (deviceChosen) return
    if (window.innerWidth < 900) setDevice('mobile')
  }, [deviceChosen])

  /*
   * Размер экрана — только показ, поэтому меняем его без похода на сервер:
   * права от него не зависят, а перерисовка всей страницы ради ширины рамки
   * стоила бы заметной паузы. Адрес при этом поправляем, чтобы ссылкой
   * на «кабинет клиента с телефона» можно было поделиться.
   */
  const pick = (next: Device) => {
    if (next === device) return
    change(() => setDevice(next))
    const url = new URL(window.location.href)
    url.searchParams.set('device', next)
    window.history.replaceState(null, '', url)
  }

  /*
   * Кнопка «назад» меняет адрес, но не состояние React. Без этого после
   * возврата в адресе стоял `device=mobile`, а переключатель и рамка
   * показывали компьютер — и человек не мог понять, чему верить.
   */
  useEffect(() => {
    const sync = () => {
      const asked = new URL(window.location.href).searchParams.get('device')
      if (asked === 'desktop' || asked === 'mobile') setDevice(asked)
    }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  /*
   * Ширину места меряем, а не предполагаем: страницу открывают и на мониторе,
   * и с телефона. Если рамка не помещается, она уменьшается целиком — так
   * видно настоящую раскладку, а не сплюснутую.
   */
  const stage = useRef<HTMLDivElement | null>(null)
  const [available, setAvailable] = useState(0)
  useLayoutEffect(() => {
    const node = stage.current
    if (!node) return

    /*
     * Первое измерение делаем тут же и сами. `ResizeObserver` сообщает размер
     * только со следующим кадром, а кадра может и не быть — во вкладке позади
     * или пока окно свёрнуто. Тогда рамка успевала нарисоваться в натуральную
     * величину и обрезалась, вместо того чтобы уменьшиться.
     */
    const measure = () => setAvailable(node.getBoundingClientRect().width)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  /*
   * Телефон не уменьшаем — никогда.
   *
   * Уменьшение делает картинку нечитаемой и некликабельной: на странице
   * шириной 360 точек рамка телефона в 414 сжималась до восьмидесяти
   * процентов, и кнопки становились меньше пальца. Вместо этого на узком
   * месте убираем декоративный корпус и отдаём приложению всю ширину —
   * рантайм и так считает раскладку по ширине контейнера.
   */
  const frame = FRAMES[device]
  const phone = device === 'mobile'
  const tight = available > 0 && available < frame.width + frame.bezel * 2

  const bezel = phone && tight ? 0 : frame.bezel
  const width = phone ? (tight ? Math.max(available, 280) : frame.width) : frame.width
  const outerWidth = width + bezel * 2
  const outerHeight = frame.height + bezel * 2

  // Уменьшается только компьютер: показать его на телефоне иначе нечем.
  const fit = phone || available === 0 ? 1 : Math.min(1, available / outerWidth)
  const scale = expanded ? 1 : fit
  /** Ниже половины читать уже нечего — предлагаем крупный режим. */
  const tooSmall = !phone && fit < 0.55

  const roleHref = (roleId: string) => `/demo?role=${roleId}&device=${device}`

  return (
    <div>
      {/* Панель управления: роль и размер экрана — один орган управления. */}
      <div className="rounded-2xl border border-sand-200 bg-white p-3.5 shadow-soft sm:p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Роль</p>
            {roles.length > MAX_PILLS ? (
              <label className="mt-2 block">
                <span className="sr-only">Роль, глазами которой смотрим</span>
                <select
                  value={activeRole}
                  onChange={(event) => router.push(roleHref(event.target.value), { scroll: false })}
                  className="w-full rounded-xl border border-sand-300 bg-white px-3.5 py-2.5 text-sm font-medium outline-none focus-visible:border-ink/40 sm:w-64"
                >
                  {roles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {roles.map((item) => (
                  <Link
                    key={item.id}
                    href={roleHref(item.id)}
                    scroll={false}
                    aria-current={activeRole === item.id ? 'true' : undefined}
                    className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                      activeRole === item.id
                        ? 'bg-ink text-sand-50 shadow-soft'
                        : 'border border-sand-300 bg-white hover:-translate-y-px hover:border-ink/25'
                    }`}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Просмотр</p>
            <div
              role="group"
              aria-label="Размер экрана"
              className="mt-2 inline-flex rounded-xl border border-sand-300 bg-white p-1"
            >
              {DEVICES.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={device === item}
                  onClick={() => pick(item)}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                    device === item ? 'bg-ink text-sand-50' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  <Icon name={DEVICE_ICONS[item]} className="size-4" />
                  {DEVICE_NAMES[item]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2.5 border-t border-sand-200 pt-2.5">{description}</div>
      </div>

      {/*
       * На компьютере пояснение идёт над приложением во всю ширину, на телефоне —
       * сбоку: рамка узкая, и половина строки рядом с ней всё равно пустует.
       */}
      {/*
       * `minmax(0,1fr)` обязателен: колонка с шириной `auto` растягивается
       * по содержимому, рамка перестаёт помещаться и тянет за собой
       * прокрутку всей страницы — а измерение места возвращает уже
       * растянутую ширину, и уменьшать оказывается нечего.
       */}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="inline-flex items-center rounded-md bg-sand-200/70 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                Демо
              </span>
              изменения не сохраняются
            </p>

            {tooSmall ? (
              <button
                ref={opener}
                type="button"
                onClick={() => setExpanded(true)}
                className="inline-flex min-h-11 items-center rounded-xl border border-sand-300 bg-white px-3 text-xs font-medium transition-colors hover:border-ink/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                Открыть крупно
              </button>
            ) : null}
          </div>

          {expanded ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="demo-expanded-title"
              className="fixed inset-0 z-[60] flex flex-col bg-ink/85 backdrop-blur-sm"
            >
              {/* Полоса непрозрачная: под ней шапка сайта, и она просвечивала. */}
              <div className="flex h-[4.25rem] shrink-0 items-center justify-between gap-3 bg-ink px-4 text-sand-50">
                <p id="demo-expanded-title" className="text-sm">
                  Компьютерный вид · прокрутите вбок
                </p>
                <button
                  ref={closer}
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="inline-flex min-h-11 items-center rounded-xl bg-sand-50 px-4 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-50"
                >
                  Закрыть
                </button>
              </div>
            </div>
          ) : null}

          {/* Обрезаем здесь: даже на мгновение полосы прокрутки поперёк страницы быть не должно. */}
          <div
            className={
              expanded
                ? 'fixed inset-x-0 bottom-0 top-[4.25rem] z-[61] overflow-auto p-3'
                : 'overflow-hidden px-1 py-2'
            }
          >
          <div ref={stage} className="w-full">
            {/*
             * Центрирование и прокрутка несовместимы: у отцентрованного
             * блока шире контейнера левый край уезжает за границу и достать
             * его прокруткой нельзя. В крупном режиме прижимаем влево.
             */}
            <div className={expanded ? 'flex justify-start' : 'flex justify-center'}>
              <div
                className="demo-motion-frame relative shrink-0"
                style={{ width: outerWidth * scale, height: outerHeight * scale, viewTransitionName: frameName }}
              >
                <div
                  className="absolute left-0 top-0 origin-top-left"
                  style={{ width: outerWidth, height: outerHeight, transform: `scale(${scale})` }}
                >
                  <DeviceFrame device={device} height={frame.height} bezel={bezel}>
                    {children}
                  </DeviceFrame>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Рамка вокруг приложения.
 *
 * Одна на оба размера — и это не экономия, а необходимость. Когда рамок было
 * две и они подменяли друг друга, React считал приложение внутри новым: при
 * переключении «Телефон ↔ Компьютер» оно пересоздавалось и возвращалось
 * на главную, теряя открытую карточку и отбор списка.
 *
 * Поэтому меняются только классы вокруг, а само приложение остаётся на своём
 * месте в дереве.
 */
export function DeviceFrame({
  device,
  height,
  bezel,
  children,
}: {
  device: Device
  height: number
  bezel: number
  children: ReactNode
}) {
  const desktop = device === 'desktop'

  return (
    <div
      className={
        desktop
          ? 'flex h-full flex-col overflow-hidden rounded-2xl border border-sand-300 bg-white shadow-lift'
          : bezel > 0
            ? 'h-full overflow-hidden rounded-[2.5rem] bg-ink/85 shadow-lift'
            : // Корпуса нет — на узком экране он только съедал ширину.
              'h-full overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-soft'
      }
      style={desktop || bezel === 0 ? undefined : { padding: bezel }}
    >
      {desktop ? <BrowserChrome /> : null}

      <div
        className={`demo-frame relative isolate overflow-hidden ${
          desktop ? 'min-h-0 flex-1' : bezel > 0 ? 'rounded-[1.9rem] bg-white' : 'bg-white'
        }`}
        style={{ height, ...(device === 'mobile' && bezel > 0 ? { clipPath: 'inset(0 round 1.9rem)' } : {}) }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Полоса окна браузера.
 *
 * Ровно столько украшений, чтобы стало понятно: это не картинка в статье,
 * а рабочее приложение по адресу. Рисовать кнопки, вкладки и адресную строку
 * целиком незачем — смотреть будут внутрь.
 */
function BrowserChrome() {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-sand-200 bg-sand-100/80 px-4 py-2.5">
      <span className="flex gap-1.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-sand-300" />
        <span className="size-2.5 rounded-full bg-sand-300" />
        <span className="size-2.5 rounded-full bg-sand-300" />
      </span>
      <span className="mx-auto rounded-md border border-sand-200 bg-white px-3 py-1 text-xs text-ink-muted">
        app.tableapp.ru/a/kabinet-klienta
      </span>
    </div>
  )
}
