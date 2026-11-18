// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProjectsGantt } from './projects-gantt'

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const now = Date.parse('2026-11-18T09:00:00.000Z')

const tasks = [
  {
    id: 't1', title: 'Собрать структуру разделов', start: '2026-11-12', due: '2026-11-16',
    status: 'В работе', parentId: '', estimate: 240, spent: 120, assigneeName: 'Анна Волкова',
  },
  {
    id: 't2', title: 'Макет главной страницы', start: '2026-11-15', due: '2026-11-18',
    status: 'На проверке', parentId: '', estimate: 360, spent: 90, assigneeName: 'Анна Волкова',
  },
  {
    id: 't3', title: 'Подключить форму заявки', start: '2026-11-08', due: '2026-11-14',
    status: 'Готово', parentId: '', estimate: 120, spent: 120, assigneeName: 'Игорь Белов',
  },
]

const links = [
  { id: 'l1', fromId: 't1', toId: 't2' },
  { id: 'l2', fromId: 't2', toId: 't3' },
]

it('shows explainer, legend and hides dependency links by default', () => {
  render(<ProjectsGantt tasks={tasks} links={links} now={now} onOpenTask={vi.fn()} />)
  expect(screen.getByText('План проекта на календаре: каждая полоса — задача от начала до срока.')).toBeTruthy()
  const legend = screen.getByLabelText('Обозначения')
  expect(within(legend).getByText('Готово')).toBeTruthy()
  expect(within(legend).getByText('В работе')).toBeTruthy()
  expect(within(legend).getByText('На проверке')).toBeTruthy()
  expect(within(legend).getByText('Просрочено')).toBeTruthy()
  expect(within(legend).getByText('Сегодня')).toBeTruthy()
  expect(document.querySelectorAll('[data-gantt-link]')).toHaveLength(0)
  const toggle = screen.getByRole('switch', { name: 'Показать связи' })
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  expect(toggle.tagName).toBe('BUTTON')
  expect(toggle.querySelector('input')).toBeNull()
})

it('keeps dependency links hidden until «Показать связи» is on — hover does not reveal them', () => {
  render(<ProjectsGantt tasks={tasks} links={links} now={now} onOpenTask={vi.fn()} />)
  const bar = document.querySelector('[data-bar-id="t1"] [data-tone]') as HTMLElement
  fireEvent.mouseEnter(bar)
  expect(document.querySelectorAll('[data-gantt-link]')).toHaveLength(0)
  fireEvent.click(screen.getByRole('switch', { name: 'Показать связи' }))
  expect(screen.getByRole('switch', { name: 'Показать связи' }).getAttribute('aria-checked')).toBe('true')
  expect(document.querySelectorAll('[data-gantt-link]')).toHaveLength(2)
})

it('opens a task popover with dates, status and open link', () => {
  const onOpenTask = vi.fn()
  render(<ProjectsGantt tasks={tasks} links={links} now={now} onOpenTask={onOpenTask} />)
  const bar = document.querySelector('[data-bar-id="t2"] [data-tone]') as HTMLElement
  fireEvent.click(bar)
  const popover = screen.getByRole('dialog', { name: 'Макет главной страницы' })
  expect(within(popover).getByText('15.11.2026–18.11.2026')).toBeTruthy()
  expect(within(popover).getByText('На проверке')).toBeTruthy()
  expect(within(popover).getByText('Прогресс: 1 ч 30 мин / 6 ч')).toBeTruthy()
  fireEvent.click(within(popover).getByRole('button', { name: 'Открыть задачу' }))
  expect(onOpenTask).toHaveBeenCalledWith('t2')
})

it('opens the same popover from the name column without navigating away', () => {
  const onOpenTask = vi.fn()
  render(<ProjectsGantt tasks={tasks} links={links} now={now} onOpenTask={onOpenTask} />)
  fireEvent.click(document.querySelector('[data-gantt-label="t1"]') as HTMLElement)
  expect(screen.getByRole('dialog', { name: 'Собрать структуру разделов' })).toBeTruthy()
  expect(onOpenTask).not.toHaveBeenCalled()
})

it('opens the popover from the caption beside the bar', () => {
  const onOpenTask = vi.fn()
  render(<ProjectsGantt tasks={tasks} links={links} now={now} onOpenTask={onOpenTask} />)
  fireEvent.click(document.querySelector('[data-bar-label="t1"]') as HTMLElement)
  expect(screen.getByRole('dialog', { name: 'Собрать структуру разделов' })).toBeTruthy()
  expect(onOpenTask).not.toHaveBeenCalled()
})

it('keeps bars text-free and shows avatar+name captions outside the bar', () => {
  const long = 'Очень длинное название задачи для проверки переноса на две строки без обрезки в полосе'
  render(<ProjectsGantt
    tasks={[
      ...tasks,
      {
        id: 't4', title: long, start: '2026-11-10', due: '2026-11-20',
        status: 'В работе', parentId: '', estimate: null, spent: 0, assigneeName: 'Анна Волкова',
      },
    ]}
    links={[]}
    now={now}
    onOpenTask={vi.fn()}
  />)
  expect(document.querySelectorAll('[data-bar-id]')).toHaveLength(4)
  for (const wrap of document.querySelectorAll('[data-bar-id]')) {
    const bar = wrap.querySelector('[data-tone]') as HTMLElement
    expect(bar.textContent?.trim() ?? '').toBe('')
  }
  const caption = document.querySelector('[data-bar-label="t4"]') as HTMLElement
  expect(caption).toBeTruthy()
  expect(caption.getAttribute('title')).toBe(long)
  expect(within(caption).getByText(long)).toBeTruthy()
  expect(caption.querySelector('[aria-label="Анна Волкова"]')).toBeTruthy()
  expect(document.querySelector('[data-gantt-names]')).toBeTruthy()
})

it('caps caption width to the visible timeline viewport and flips near the right edge', () => {
  render(<ProjectsGantt
    tasks={[
      {
        id: 'edge',
        title: 'Задача у правого края шкалы с длинным названием для подписи',
        start: '2026-11-16', due: '2026-11-18',
        status: 'В работе', parentId: '', estimate: null, spent: 0, assigneeName: 'Анна Волкова',
      },
    ]}
    links={[]}
    now={now}
    onOpenTask={vi.fn()}
  />)
  fireEvent.click(screen.getByRole('button', { name: 'Дни' }))
  const scroll = document.querySelector('[class*="ganttScroll"]') as HTMLElement
  expect(scroll).toBeTruthy()
  Object.defineProperty(scroll, 'clientWidth', { configurable: true, value: 240 })
  Object.defineProperty(scroll, 'scrollLeft', { configurable: true, value: 0, writable: true })
  fireEvent.scroll(scroll)
  const caption = document.querySelector('[data-bar-label="edge"]') as HTMLElement
  expect(caption.getAttribute('data-side')).toBe('left')
  const max = Number.parseFloat(caption.style.maxWidth || '0')
  expect(max).toBeGreaterThan(0)
  expect(max).toBeLessThanOrEqual(240)
})

it('highlights the whole row on hover across name column and timeline', () => {
  render(<ProjectsGantt tasks={tasks} links={[]} now={now} onOpenTask={vi.fn()} />)
  const label = document.querySelector('[data-gantt-label="t2"]') as HTMLElement
  fireEvent.mouseEnter(label)
  expect(label.hasAttribute('data-hover')).toBe(true)
  expect(document.querySelector('[data-gantt-row="t2"]')?.hasAttribute('data-hover')).toBe(true)
  fireEvent.mouseLeave(label)
  expect(label.hasAttribute('data-hover')).toBe(false)
})

it('aligns status dots and indents nested task text with a tree connector', () => {
  render(<ProjectsGantt
    tasks={[
      tasks[0]!,
      {
        id: 'c1', title: 'Подзадача: навигация', start: '2026-11-13', due: '2026-11-15',
        status: 'К работе', parentId: 't1', estimate: null, spent: 0,
      },
      tasks[1]!,
    ]}
    links={[]}
    now={now}
    onOpenTask={vi.fn()}
  />)
  const names = [...document.querySelectorAll('[data-gantt-label]')].map(node => node.getAttribute('data-gantt-label'))
  expect(names).toEqual(['t1', 'c1', 't2'])
  expect(document.querySelector('[data-gantt-label="c1"]')?.hasAttribute('data-nested')).toBe(true)
  expect(document.querySelector('[data-gantt-label="t1"]')?.hasAttribute('data-nested')).toBe(false)
  expect(document.querySelector('[data-gantt-label="c1"] [data-gantt-tree]')).toBeTruthy()
  expect(document.querySelector('[data-gantt-label="t1"] [data-gantt-tree]')).toBeNull()
  expect(document.querySelector('[data-bar-id="c1"]')).toBeTruthy()
})

it('colors bars by tone including overdue and paints progress fill', () => {
  render(<ProjectsGantt tasks={tasks} links={[]} now={now} onOpenTask={vi.fn()} />)
  expect(document.querySelector('[data-bar-id="t3"] [data-tone]')?.getAttribute('data-tone')).toBe('done')
  expect(document.querySelector('[data-bar-id="t1"] [data-tone]')?.getAttribute('data-tone')).toBe('overdue')
  expect(document.querySelector('[data-bar-id="t2"] [data-tone]')?.getAttribute('data-tone')).toBe('review')
  const fill = document.querySelector('[data-bar-id="t1"] [data-gantt-fill]') as HTMLElement
  expect(fill?.style.width).toBe('50%')
})

it('shows empty state when tasks have no dates', () => {
  render(<ProjectsGantt
    tasks={[{ id: 'x', title: 'Без дат', start: null, due: null, status: 'К работе', parentId: '', estimate: null, spent: 0 }]}
    links={[]}
    now={now}
    onOpenTask={vi.fn()}
  />)
  expect(screen.getByText('У задач нет сроков — добавьте даты, чтобы увидеть план')).toBeTruthy()
})

it('shows «Сроки» list on phone and hides chart toggles', () => {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('max-width: 767px'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }))
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: matchMedia })
  const onOpenTask = vi.fn()
  render(<ProjectsGantt
    tasks={[
      tasks[0]!,
      {
        id: 'c1', title: 'Подзадача: навигация', start: '2026-11-13', due: '2026-11-15',
        status: 'К работе', parentId: 't1', estimate: null, spent: 0, assigneeName: 'Анна Волкова',
      },
      tasks[1]!,
    ]}
    links={links}
    now={now}
    onOpenTask={onOpenTask}
  />)
  expect(screen.getByRole('heading', { name: 'Сроки' })).toBeTruthy()
  expect(document.querySelector('[data-gantt-deadlines]')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Список' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Диаграмма' })).toBeNull()
  expect(screen.queryByRole('switch', { name: 'Показать связи' })).toBeNull()
  expect(screen.queryByRole('radiogroup', { name: 'Масштаб Ганта' })).toBeNull()
  expect(screen.getByText('12.11.2026 – 16.11.2026')).toBeTruthy()
  expect(document.querySelector('[data-nested="true"]')).toBeTruthy()
  fireEvent.click(screen.getByText('Макет главной страницы'))
  expect(onOpenTask).toHaveBeenCalledWith('t2')
})
