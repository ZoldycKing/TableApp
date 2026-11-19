// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { boardAdvanceLabel, boardNextStatus } from './projects-screens'
import { ProjectsDemo } from './projects-demo'

function mockMatchMedia(matches: boolean) {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('max-width: 767px') ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: matchMedia })
}

afterEach(() => cleanup())

describe('board advance labels', () => {
  it('uses clear verbs and has no action for done', () => {
    expect(boardAdvanceLabel('К работе')).toBe('Взять в работу')
    expect(boardAdvanceLabel('В работе')).toBe('На проверку')
    expect(boardAdvanceLabel('На проверке')).toBe('Принять')
    expect(boardAdvanceLabel('Готово')).toBeNull()
    expect(boardNextStatus('К работе')).toBe('В работе')
    expect(boardNextStatus('Готово')).toBeNull()
  })
})

describe('board card actions', () => {
  beforeEach(() => mockMatchMedia(false))

  it('desktop: no advance button, ⋯ menu lists all statuses', async () => {
    mockMatchMedia(false)
    render(<ProjectsDemo view="board" bare />)
    await screen.findByRole('heading', { name: 'Доска' })
    expect(screen.queryByText('→ В работу')).toBeNull()
    expect(screen.queryByText('Взять в работу')).toBeNull()
    expect(document.querySelector('[data-board-advance]')).toBeNull()
    const menuButtons = screen.getAllByLabelText('Ещё')
    expect(menuButtons.length).toBeGreaterThan(0)
    fireEvent.click(menuButtons[0]!)
    const menu = screen.getByRole('menu', { name: 'Сменить статус' })
    expect(within(menu).getByText('Сменить статус')).toBeTruthy()
    for (const name of ['К работе', 'В работе', 'На проверке', 'Готово']) {
      expect(within(menu).getByRole('menuitem', { name })).toBeTruthy()
    }
    expect(menu.querySelector('select')).toBeNull()
  })

  it('phone: shows one advance verb and ⋯ menu', async () => {
    mockMatchMedia(true)
    render(<ProjectsDemo view="board" bare />)
    await screen.findByRole('heading', { name: 'Доска' })
    const advance = await screen.findAllByText('Взять в работу')
    expect(advance.length).toBeGreaterThan(0)
    expect(screen.queryByText('→ В работу')).toBeNull()
    expect(screen.queryByText('→ Проверку')).toBeNull()
    fireEvent.click(screen.getAllByLabelText('Ещё')[0]!)
    expect(screen.getByRole('menu', { name: 'Сменить статус' })).toBeTruthy()
  })
})
