// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TableActionsMenu } from './table-actions-menu'

afterEach(cleanup)
it('dismisses on Escape and outside interaction, and retains real actions', () => {
  const action = vi.fn()
  const ui = render(<><TableActionsMenu><button onClick={action}>История</button><a href="/apps">Приложения</a></TableActionsMenu><button>Снаружи</button></>)
  const trigger = ui.getByRole('button', { name: 'Действия с таблицей' })
  fireEvent.click(trigger)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  expect(ui.getByRole('link', { name: 'Приложения' }).getAttribute('href')).toBe('/apps')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(ui.queryByRole('region')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  fireEvent.click(trigger)
  fireEvent.pointerDown(ui.getByRole('button', { name: 'Снаружи' }))
  expect(ui.queryByRole('region')).toBeNull()
  fireEvent.click(trigger)
  fireEvent.click(ui.getByRole('button', { name: 'История' }))
  expect(action).toHaveBeenCalledOnce()
  expect(ui.queryByRole('region')).toBeNull()
})
