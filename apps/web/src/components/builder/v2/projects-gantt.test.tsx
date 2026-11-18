// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProjectsGantt } from './projects-gantt'

beforeEach(() => {
  vi.useFakeTimers()
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

it('shows only links for the hovered task until «Показать связи» is on', () => {
  render(<ProjectsGantt tasks={tasks} links={links} now={now} onOpenTask={vi.fn()} />)
  const bar = document.querySelector('[data-bar-id="t1"]') as HTMLElement
  fireEvent.mouseEnter(bar)
  act(() => { vi.advanceTimersByTime(150) })
  expect(document.querySelectorAll('[data-gantt-link]')).toHaveLength(1)
  expect(document.querySelector('[data-gantt-link="l1"]')).toBeTruthy()
  fireEvent.click(screen.getByRole('switch', { name: 'Показать связи' }))
  expect(screen.getByRole('switch', { name: 'Показать связи' }).getAttribute('aria-checked')).toBe('true')
  expect(document.querySelectorAll('[data-gantt-link]')).toHaveLength(2)
})

it('opens a task popover with dates, status and open link', () => {
  const onOpenTask = vi.fn()
  render(<ProjectsGantt tasks={tasks} links={links} now={now} onOpenTask={onOpenTask} />)
  const bar = document.querySelector('[data-bar-id="t2"]') as HTMLElement
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

it('keeps task names only in the sticky column — no labels on or beside bars', () => {
  const long = 'Очень длинное название задачи для проверки переноса на две строки без обрезки в полосе'
  render(<ProjectsGantt
    tasks={[
      ...tasks,
      {
        id: 't4', title: long, start: '2026-11-10', due: '2026-11-20',
        status: 'В работе', parentId: '', estimate: null, spent: 0,
      },
    ]}
    links={[]}
    now={now}
    onOpenTask={vi.fn()}
  />)
  expect(document.querySelectorAll('[data-bar-id]')).toHaveLength(4)
  for (const bar of document.querySelectorAll('[data-bar-id]')) {
    expect(bar.textContent?.includes(long) ?? false).toBe(false)
    expect(bar.textContent?.includes('Собрать структуру') ?? false).toBe(false)
  }
  const label = document.querySelector('[data-gantt-label="t4"]') as HTMLElement
  expect(label).toBeTruthy()
  expect(label.getAttribute('title')).toBe(long)
  expect(within(label).getByText(long)).toBeTruthy()
  expect(document.querySelector('[data-gantt-names]')).toBeTruthy()
})

it('indents subtasks under their parent in the name column', () => {
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
  expect(document.querySelector('[data-bar-id="c1"]')).toBeTruthy()
})

it('colors bars by tone including overdue', () => {
  render(<ProjectsGantt tasks={tasks} links={[]} now={now} onOpenTask={vi.fn()} />)
  expect(document.querySelector('[data-bar-id="t3"]')?.getAttribute('data-tone')).toBe('done')
  expect(document.querySelector('[data-bar-id="t1"]')?.getAttribute('data-tone')).toBe('overdue')
  expect(document.querySelector('[data-bar-id="t2"]')?.getAttribute('data-tone')).toBe('review')
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

it('uses week plan list on phone by default', () => {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('max-width: 720px'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }))
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: matchMedia })
  render(<ProjectsGantt tasks={tasks} links={links} now={now} onOpenTask={vi.fn()} />)
  expect(screen.getByRole('heading', { name: 'План по неделям' })).toBeTruthy()
  expect(document.querySelector('[data-gantt-week-plan]')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Список' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Диаграмма' }))
  expect(document.querySelector('[data-projects-gantt]')?.getAttribute('data-phone-mode')).toBe('chart')
  expect(document.querySelector('[data-gantt-week-plan]')).toBeNull()
  expect(document.querySelector('[data-gantt-names]')).toBeTruthy()
})
