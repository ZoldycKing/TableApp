// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@/app/projects-actions', () => ({ savePublishedProjectsAction: vi.fn() }))
vi.mock('@/app/builder-v2-data-actions', () => ({ readBuilderV2DataAction: vi.fn(), readBuilderV2RecordAction: vi.fn() }))
vi.mock('@/app/builder-v2-published-actions', () => ({
  readPublishedV2DataAction: vi.fn(),
  readPublishedV2RecordAction: vi.fn(),
  inspectPublishedV2FormAction: vi.fn(),
  submitPublishedV2FormAction: vi.fn(),
  inspectPublishedV2ButtonAction: vi.fn(),
  submitPublishedV2ButtonAction: vi.fn(),
  inspectPublishedV2DeleteAction: vi.fn(),
  submitPublishedV2DeleteAction: vi.fn(),
}))
vi.mock('@/app/dispatch-actions', () => ({
  savePublishedDispatchAction: vi.fn(),
  savePublishedDispatchActAction: vi.fn(),
}))

import { ProjectsDemo } from './projects-demo'

afterEach(() => cleanup())

it('separates time entries from the manual inputs with a subtitle', async () => {
  render(<ProjectsDemo view="task-time" bare />)
  const panel = await screen.findByText('Записи времени')
  const block = panel.closest('[data-time-entries]') as HTMLElement
  expect(block).toBeTruthy()
  expect(getComputedStyle(block).marginTop === '16px' || block.className.includes('timeEntries')).toBe(true)
  expect(within(block).getAllByText(/Анна Волкова/).length).toBeGreaterThan(0)
})

it('renders the clarified Gantt with legend and hidden links by default', async () => {
  render(<ProjectsDemo view="project-gantt" bare />)
  expect(await screen.findByText('План проекта на календаре: каждая полоса — задача от начала до срока.')).toBeTruthy()
  const legend = await screen.findByLabelText('Обозначения')
  expect(within(legend).getByText('Готово')).toBeTruthy()
  expect(within(legend).getByText('Просрочено')).toBeTruthy()
  expect(screen.getByRole('switch', { name: 'Показать связи' }).getAttribute('aria-checked')).toBe('false')
  expect(document.querySelectorAll('[data-gantt-link]')).toHaveLength(0)
})
