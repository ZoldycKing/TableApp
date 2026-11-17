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

it('shows persisted comment counts on parent subtask rows', async () => {
  render(<ProjectsDemo view="task" bare />)
  const tariffs = await screen.findByText('Блок тарифов')
  const list = tariffs.closest('[data-subtask-list]') as HTMLElement | null
  expect(list).toBeTruthy()
  const row = tariffs.closest('li') as HTMLElement
  const count = within(row).getByLabelText('2 комментария')
  expect(count.getAttribute('data-subtask-comments')).toBe('2')
  expect(within(count).getByText('2')).toBeTruthy()
  expect(count.querySelector('svg')).toBeTruthy()
  expect(within(list!).getByText('Подвал макета').closest('li')!.querySelector('[data-subtask-comments="1"]')).toBeTruthy()
  expect(within(list!).getByText('Сетка первого экрана').closest('li')!.querySelector('[data-subtask-comments]')).toBeNull()
  expect(within(list!).getByText('Сетка первого экрана').getAttribute('data-done')).toBe('true')
})
