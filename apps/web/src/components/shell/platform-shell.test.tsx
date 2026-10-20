// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Оболочка платформы.
 *
 * Проверяется поведение, которое нельзя увидеть на снимке экрана и легко
 * сломать правкой вёрстки: что панель одна на все виды, что «где я нахожусь»
 * сказано голосом, а не только цветом, и что выдвижная панель на телефоне
 * ведёт себя как положено окну поверх страницы.
 *
 * Среда браузера включена только для этого файла: остальные проверки чистые,
 * и тащить в них разметку незачем.
 */

let pathname = '/usage'

/**
 * Подпорки под среду без настоящего браузера.
 *
 * `matchMedia` в jsdom нет вовсе, а размеры у всего нулевые. Выезд по краю
 * и положение меню без них не проверить: первое спрашивает у устройства
 * про курсор, второе считает по месту кнопки на экране.
 */
let matchesPointer = true
const TRIGGER_TOP = 700
const MENU_HEIGHT = 200
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
/** Ссылка Next в проверках — обычная `a`: маршрутизатора здесь нет. */
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode
    href: string
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/app/auth-actions', () => ({ signOutMemberAction: vi.fn() }))
vi.mock('@/app/team-actions', () => ({ switchWorkspaceAction: vi.fn() }))
vi.mock('@/app/business-navigation-actions', () => ({ navigateBusinessResourceAction: vi.fn(), createBusinessAction: vi.fn() }))

const { PlatformShell } = await import('./platform-shell')
const { COOKIE_VALUE, modeFromCookie } = await import('./variant')

const WORKSPACES = [
  { workspaceId: 'wsp_1', workspaceName: 'Демо-воркспейс' },
  { workspaceId: 'wsp_2', workspaceName: 'Вторая фирма' },
]

function show(overrides: Partial<Parameters<typeof PlatformShell>[0]> = {}) {
  return render(
    <PlatformShell
      email="nikolala13@yandex.ru"
      role="owner"
      workspaceName="Демо-воркспейс"
      workspaces={WORKSPACES}
      activeWorkspaceId="wsp_1"
      initialMode="auto"
      {...overrides}
    >
      <p>Содержимое страницы</p>
    </PlatformShell>,
  )
}

beforeEach(() => {
  pathname = '/usage'
  matchesPointer = true
  document.cookie = 'tableapp_sidebar=; path=/; max-age=0'

  window.matchMedia = ((query: string) =>
    ({
      matches: matchesPointer,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia

  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })

  // Кнопка — внизу окна, меню — обычной высоты: только так видно,
  // что меню разворачивается вверх, а не вниз за край.
  Element.prototype.getBoundingClientRect = function () {
    const menu = (this as HTMLElement).getAttribute('role') === 'menu'
    const top = menu ? 0 : TRIGGER_TOP
    const height = menu ? MENU_HEIGHT : 40
    return {
      top,
      bottom: top + height,
      left: 12,
      right: 232,
      width: 220,
      height,
      x: 12,
      y: top,
      toJSON: () => ({}),
    } as DOMRect
  }
})

afterEach(cleanup)

describe('боковая панель', () => {
  it('показывает все разделы и содержимое страницы', () => {
    show()
    const nav = screen.getAllByRole('navigation', { name: 'Разделы платформы' })[0]!
    for (const label of ['Таблицы', 'Шаблоны', 'Приложения', 'Команда и доступ', 'Использование']) {
      expect(within(nav).getByRole('link', { name: label })).toBeTruthy()
    }
    expect(screen.getByText('Содержимое страницы')).toBeTruthy()
  })

  it('открытый раздел назван голосом, а не только цветом', () => {
    /*
     * `aria-current` — единственный способ сказать «вы здесь» тому, кто
     * не видит подсветки. Без него незрячий человек не отличает открытый
     * раздел от остальных.
     */
    show()
    const current = screen.getAllByRole('link', { current: 'page' })
    expect(current.length).toBeGreaterThan(0)
    expect(current[0]!.textContent).toContain('Использование')
  })

  it('подсветка держится на вложенной странице', () => {
    pathname = '/apps/app_123/settings'
    show()
    expect(screen.getAllByRole('link', { current: 'page' })[0]!.textContent).toContain('Приложения')
  })

  it('безопасности нет среди разделов, но она есть в меню пользователя', () => {
    show()
    const nav = screen.getAllByRole('navigation', { name: 'Разделы платформы' })[0]!
    expect(within(nav).queryByText('Безопасность')).toBe(null)

    fireEvent.click(screen.getAllByRole('button', { name: /Учётная запись/ })[0]!)
    expect(screen.getByRole('menuitem', { name: 'Безопасность' })).toBeTruthy()
  })

  it('полной почты наверху нет — она внизу, у учётной записи', () => {
    // Наверху человек отвечает на вопрос «где я работаю», а не «кто я».
    show()
    const switcher = screen.getAllByRole('button', { name: /Рабочее пространство/ })[0]!
    expect(switcher.textContent).not.toContain('@')
  })
})

describe('ресурсы нескольких бизнесов', () => {
  const businesses = [
    { workspaceId: 'wsp_1', workspaceName: 'Демо-воркспейс', businessName: 'ООО «Ромашка»', role: 'owner' as const,
      tables: [{ id: 'tbl_goods', name: 'Товары', icon: 'box' }], apps: [{ id: 'app_shop', name: 'Магазин «Ромашка»', published: true }] },
    { workspaceId: 'wsp_2', workspaceName: 'Вторая фирма', businessName: 'ИП Иванов', role: 'viewer' as const,
      tables: [{ id: 'tbl_services', name: 'Услуги', icon: 'table' }], apps: [] },
  ]

  it('показывает дерево вместо повторных общих пунктов и переключателя', () => {
    pathname = '/t/tbl_goods'
    show({ businesses, initialMode: 'pinned' })
    const panel = document.querySelector('#platform-sidebar') as HTMLElement
    expect(panel.className).toContain('w-[280px]')
    expect(document.querySelector('[data-rail-spacer]')?.className).toContain('w-[304px]')
    const tree = within(panel).getByRole('navigation', { name: 'Пространства, таблицы и приложения' })
    expect(within(tree).getByRole('button', { name: 'Товары', current: 'page' })).toBeTruthy()
    expect(within(tree).getByRole('button', { name: 'Пространство: Вторая фирма' })).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: /Рабочее пространство/ })).toBeNull()
    expect(within(panel).queryByRole('link', { name: 'Таблицы' })).toBeNull()
    expect(within(panel).queryByRole('link', { name: 'Приложения' })).toBeNull()
    expect(within(panel).getByText('Пространство: Демо-воркспейс')).toBeTruthy()
    expect(within(panel).getByRole('link', { name: 'Команда и доступ' })).toBeTruthy()
  })

  it('на телефоне показывает выбор бизнеса и только его ресурсы', () => {
    show({ businesses })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }))
    const drawer = screen.getByRole('dialog', { name: 'Меню платформы' })
    expect(within(drawer).getByRole('combobox', { name: 'Пространство' })).toBeTruthy()
    expect(within(drawer).getByRole('button', { name: 'Товары' })).toBeTruthy()
    expect(within(drawer).queryByRole('button', { name: 'Услуги' })).toBeNull()
    expect(within(drawer).queryByRole('link', { name: 'Таблицы' })).toBeNull()
    expect(within(drawer).getByRole('link', { name: 'Шаблоны' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('переключатель пространства', () => {
  it('показывает все пространства и отмечает текущее', () => {
    show()
    fireEvent.click(screen.getAllByRole('button', { name: /Рабочее пространство/ })[0]!)
    const current = screen.getAllByRole('menuitem', { name: /Демо-воркспейс/ })[0]!
    expect(current.getAttribute('aria-current')).toBe('true')
    expect(screen.getAllByRole('menuitem', { name: /Вторая фирма/ })[0]).toBeTruthy()
  })

  it('с одним пространством переключать нечего — меню нет', () => {
    // Выпадающее меню с одним пунктом обманывает ожидание.
    show({ workspaces: [WORKSPACES[0]!] })
    expect(screen.queryByRole('button', { name: /Рабочее пространство/ })).toBe(null)
  })

  it('Escape закрывает меню', () => {
    show()
    fireEvent.click(screen.getAllByRole('button', { name: /Рабочее пространство/ })[0]!)
    expect(screen.getAllByRole('menu').length).toBeGreaterThan(0)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBe(null)
  })

  it('меню тоже рисуется вне панели', () => {
    // Панель умеет прятаться и обрезает содержимое по себе — из неё
    // не показать ни одно меню, включая это.
    show()
    fireEvent.click(screen.getAllByRole('button', { name: /Рабочее пространство/ })[0]!)
    const menu = screen.getByRole('menu')
    expect(menu.closest('#platform-sidebar')).toBe(null)
    expect(menu.parentElement).toBe(document.body)
  })
})

describe('выдвижная панель на телефоне', () => {
  const open = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }))
    return screen.getByRole('dialog', { name: 'Меню платформы' })
  }

  it('открывается по нажатию и содержит те же разделы', () => {
    show()
    const drawer = open()
    for (const label of ['Таблицы', 'Шаблоны', 'Приложения', 'Команда и доступ', 'Использование']) {
      expect(within(drawer).getByRole('link', { name: label })).toBeTruthy()
    }
    expect(within(drawer).getByRole('link', { current: 'page' })).toBeTruthy()
  })

  it('запирает прокрутку страницы, пока открыта', () => {
    // Иначе человек прокручивает то, что под затемнением, и меню выглядит
    // сломанным.
    show()
    open()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('Escape закрывает и возвращает прокрутку', () => {
    show()
    open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBe(null)
    expect(document.body.style.overflow).toBe('')
  })

  it('щелчок по затемнению закрывает', () => {
    show()
    open()
    fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть меню' })[0]!)
    expect(screen.queryByRole('dialog')).toBe(null)
  })

  it('закрывается после перехода в раздел', () => {
    // Иначе она перекрывает ровно то, ради чего её открыли.
    show()
    const drawer = open()
    fireEvent.click(within(drawer).getByRole('link', { name: 'Команда и доступ' }))
    expect(screen.queryByRole('dialog')).toBe(null)
  })

  it('внимание уходит внутрь окна', () => {
    show()
    const drawer = open()
    expect(drawer.contains(document.activeElement)).toBe(true)
  })
})

describe('полоска и разворот', () => {
  const panel = () => document.querySelector('#platform-sidebar') as HTMLElement
  const spacer = () => document.querySelector('[data-rail-spacer]') as HTMLElement
  const state = () => panel().getAttribute('data-expanded')
  const expand = () => screen.getByRole('button', { name: 'Развернуть панель' })

  it('у нового человека панель — узкая полоска', () => {
    /*
     * Умолчание. Место на экране принадлежит работе: таблице на тысячу строк,
     * а не списку из шести разделов, который открывают раз в день.
     */
    show()
    expect(panel().className).toContain('w-[68px]')
    expect(panel().className).not.toContain('w-[232px]')
    expect(state()).toBe('closed')
  })

  it('панель стоит вне потока, а содержимое начинается после полоски', () => {
    /*
     * Главное правило этой оболочки. Панель разворачивается поверх
     * содержимого, и раскладка не пересчитывается ни разу: иначе таблица
     * и конструктор дёргались бы на каждое движение мышью к краю экрана.
     */
    show()
    expect(panel().className).toContain('fixed')
    expect(spacer().className).toContain('w-[92px]')
  })

  it('разворот не меняет ширину места под содержимое', () => {
    show()
    const before = spacer().className
    fireEvent.click(expand())
    expect(state()).toBe('open')
    expect(panel().className).toContain('w-[232px]')
    // Место в потоке осталось прежним: подвинулась только плавающая панель.
    expect(spacer().className).toBe(before)
  })

  it('в полоске подписи сжаты, но из разметки не исчезли', () => {
    // Читающим с экрана подпись нужна в любом виде панели.
    show()
    const nav = screen.getAllByRole('navigation', { name: 'Разделы платформы' })[0]!
    const link = within(nav).getByRole('link', { name: 'Таблицы' })
    expect(link.querySelector('span')!.className).toContain('max-w-0')

    fireEvent.click(expand())
    expect(link.querySelector('span')!.className).toContain('max-w-full')
  })

  it('развернуть можно нажатием, а не только наведением', () => {
    /*
     * Наведение — не единственный способ: с клавиатуры и на сенсорном экране
     * его не существует вовсе.
     */
    show()
    expect(expand().getAttribute('aria-controls')).toBe('platform-sidebar')
    fireEvent.click(expand())
    expect(state()).toBe('open')
    // Разворот нажатием — это ещё не выбор: кука не трогается.
    expect(document.cookie).not.toContain('pinned')
  })

  it('внимание с клавиатуры тоже разворачивает', () => {
    // Иначе человек ходит клавишей Tab по значкам без подписей.
    show()
    fireEvent.focus(panel())
    expect(state()).toBe('open')
  })

  it('закрепление запоминается и держит панель развёрнутой', () => {
    show()
    fireEvent.click(expand())
    fireEvent.click(screen.getByRole('button', { name: 'Закрепить панель' }))
    expect(document.cookie).toContain('tableapp_sidebar=pinned')
    expect(state()).toBe('open')
  })

  it('закреплённая панель развёрнута сразу, без второго кадра', () => {
    /*
     * Состояние пришло с сервера из куки. Реши его в браузере — и человек
     * увидел бы, как панель схлопывается уже после появления страницы.
     */
    show({ initialMode: 'pinned' })
    expect(panel().className).toContain('w-[232px]')
    expect(state()).toBe('open')
  })

  it('открепление возвращает полоску и режим наведения', () => {
    show({ initialMode: 'pinned' })
    fireEvent.click(screen.getByRole('button', { name: 'Открепить панель' }))
    expect(document.cookie).toContain('tableapp_sidebar=auto')
    expect(panel().className).toContain('w-[68px]')
    expect(expand()).toBeTruthy()
  })

  it('кнопка называет действие и стоит в шапке', () => {
    /*
     * Прежде она называлась «Скрыть меню» и жила в подвале под почтой.
     * Закрыть панель ищут там же, где закрывают любое окно, — наверху.
     */
    show({ initialMode: 'pinned' })
    const unpin = screen.getAllByRole('button', { name: 'Открепить панель' })
    expect(unpin).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Скрыть меню' })).toBe(null)

    const nav = screen.getAllByRole('navigation', { name: 'Разделы платформы' })[0]!
    expect(unpin[0]!.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('старая кука', () => {
  /*
   * Кука уже лежит в браузерах: прежде она хранила «свёрнуто ли».
   * Сломать её значит переоткрыть панель тем, кто её закрыл, — и наоборот.
   */
  it('развёрнутая становится закреплённой', () => {
    expect(modeFromCookie('0')).toBe('pinned')
    expect(modeFromCookie('wide')).toBe('pinned')
  })

  it('свёрнутая читается как новое умолчание', () => {
    expect(modeFromCookie('1')).toBe('auto')
    expect(modeFromCookie('narrow')).toBe('auto')
  })

  it('пустая и незнакомая — тоже умолчание', () => {
    expect(modeFromCookie(undefined)).toBe('auto')
    expect(modeFromCookie('')).toBe('auto')
    expect(modeFromCookie('что-то своё')).toBe('auto')
  })

  it('впредь пишем словом', () => {
    // Куку читают глазами в отладчике, и `pinned` говорит там больше, чем `0`.
    expect(modeFromCookie(COOKIE_VALUE.pinned)).toBe('pinned')
    expect(modeFromCookie(COOKIE_VALUE.auto)).toBe('auto')
  })
})

describe('разворот по наведению', () => {
  const panel = () => document.querySelector('#platform-sidebar') as HTMLElement
  const state = () => panel().getAttribute('data-expanded')

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(['ожидание наведения', 'ожидание сворачивания', 'открытое меню'] as const)('не оставляет таймеры после удаления оболочки: %s', state => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    const ui = show(), sidebar = panel()
    if (state === 'ожидание наведения') fireEvent.mouseEnter(sidebar)
    else {
      fireEvent.mouseEnter(sidebar)
      act(() => void vi.advanceTimersByTime(300))
      if (state === 'открытое меню') fireEvent.click(within(sidebar).getByRole('button', { name: /Учётная запись/ }))
      else fireEvent.mouseLeave(sidebar)
    }
    ui.unmount()
    expect(vi.getTimerCount()).toBe(0)
    act(() => void vi.advanceTimersByTime(1000))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('курсор на полоске разворачивает её поверх содержимого', () => {
    show()
    fireEvent.mouseEnter(panel())
    act(() => void vi.advanceTimersByTime(300))
    expect(state()).toBe('open')
    expect(panel().className).toContain('fixed')
  })

  it('мимолётное касание панель не разворачивает', () => {
    // Человек, ведущий мышь мимо, не должен каждый раз получать навигацию
    // поперёк экрана.
    show()
    fireEvent.mouseEnter(panel())
    act(() => void vi.advanceTimersByTime(60))
    expect(state()).toBe('closed')
  })

  it('уход курсора сворачивает обратно', () => {
    show()
    fireEvent.mouseEnter(panel())
    act(() => void vi.advanceTimersByTime(300))
    fireEvent.mouseLeave(panel())
    act(() => void vi.advanceTimersByTime(400))
    expect(state()).toBe('closed')
  })

  it('временный разворот не запоминается', () => {
    // Это подсказка, а не выбор: запомнить её значит переоткрыть панель
    // человеку, который её свернул.
    show()
    fireEvent.mouseEnter(panel())
    act(() => void vi.advanceTimersByTime(300))
    expect(document.cookie).not.toContain('pinned')
  })

  it('на устройстве без курсора наведения нет', () => {
    matchesPointer = false
    show()
    fireEvent.mouseEnter(panel())
    act(() => void vi.advanceTimersByTime(400))
    expect(state()).toBe('closed')
  })

  it('открытое меню придерживает уборку', () => {
    /*
     * Человек тянется к пункту меню — курсор при этом уходит с панели.
     * Без этого меню исчезало бы у него из-под руки.
     */
    show()
    fireEvent.mouseEnter(panel())
    act(() => void vi.advanceTimersByTime(300))
    fireEvent.click(within(panel()).getByRole('button', { name: /Учётная запись/ }))
    fireEvent.mouseLeave(panel())
    act(() => void vi.advanceTimersByTime(600))
    expect(state()).toBe('open')
  })

  it('щелчок мимо сворачивает развёрнутую нажатием', () => {
    // На планшете наведения нет, и убрать панель было бы нечем.
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть панель' }))
    expect(state()).toBe('open')
    fireEvent.mouseDown(document.body)
    expect(state()).toBe('closed')
  })

  it('закреплённую панель наведение и щелчки не трогают', () => {
    show({ initialMode: 'pinned' })
    fireEvent.mouseLeave(panel())
    act(() => void vi.advanceTimersByTime(600))
    fireEvent.mouseDown(document.body)
    expect(state()).toBe('open')
  })
})

describe('меню учётной записи', () => {
  const openMenu = () => {
    fireEvent.click(screen.getAllByRole('button', { name: /Учётная запись/ })[0]!)
    return screen.getByRole('menu')
  }

  it('рисуется вне панели, поэтому ею не обрезается', () => {
    /*
     * Панель умеет прятаться и обрезает содержимое по себе. Меню внутри неё
     * показать нельзя никак — оно уезжает вместе с ней.
     */
    show()
    const menu = openMenu()
    expect(menu.closest('#platform-sidebar')).toBe(null)
    expect(menu.parentElement).toBe(document.body)
  })

  it('открывается вверх: кнопка стоит у самого низа', () => {
    show()
    const menu = openMenu()
    // Кнопка внизу окна, меню высотой 200 — значит оно должно оказаться выше.
    expect(Number.parseFloat(menu.style.top)).toBeLessThan(TRIGGER_TOP)
    expect(menu.style.position).toBe('fixed')
  })

  it('не уходит за края окна', () => {
    show()
    const menu = openMenu()
    expect(Number.parseFloat(menu.style.top)).toBeGreaterThanOrEqual(0)
    expect(Number.parseFloat(menu.style.left)).toBeGreaterThanOrEqual(0)
  })

  it('шире кнопки даже у узкой панели', () => {
    // Иначе в спрятанной панели меню получилось бы шириной с кружок аватара.
    show()
    const menu = openMenu()
    expect(Number.parseFloat(menu.style.minWidth)).toBeGreaterThanOrEqual(210)
  })

  it('внутри только настоящие действия', () => {
    show()
    openMenu()
    expect(screen.getByRole('menuitem', { name: 'Безопасность' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Выйти/ })).toBeTruthy()
    // Переключателя пространства здесь нет: он наверху и не дублируется.
    expect(screen.queryByRole('menuitem', { name: /Вторая фирма/ })).toBe(null)
  })

  it('Escape закрывает и возвращает внимание на кнопку', () => {
    show()
    const trigger = screen.getAllByRole('button', { name: /Учётная запись/ })[0]!
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBe(null)
    expect(document.activeElement).toBe(trigger)
  })

  it('кнопка сообщает своё состояние', () => {
    show()
    const trigger = screen.getAllByRole('button', { name: /Учётная запись/ })[0]!
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })
})
