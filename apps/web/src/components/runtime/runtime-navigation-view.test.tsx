// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inventoryFixture } from '@/lib/templates/inventory-fixture.test-utils'
import { RuntimeNavigationView } from './runtime-navigation-view'
import { accentTones } from './ui'

afterEach(cleanup)
describe('mobile work navigation', () => {
  it('keeps the module selected on a secondary screen and opens its grouped destination from More', () => {
    const screens = inventoryFixture('manager').runtime.app.screens.filter(screen => screen.tab)
    const first = screens.find(screen => screen.type === 'list')!, secondary = screens.find(screen => screen.type === 'dashboard')!
    const messages = { ...first, id: '__tableapp_messages', name: 'Чат', tab: { label: 'Чат', icon: 'chat' } }
    const onOpen = vi.fn(), groups = [{ id: 'warehouse', moduleId: 'warehouse', kind: 'inventory' as const, label: 'Склад', screens: [first, secondary] }]
    const ui = render(<RuntimeNavigationView variant="mobile" tabs={[first, secondary, messages]} groups={groups} activeId={secondary.id} currentScreenId={secondary.id} accent={accentTones('blue')} onOpen={onOpen} />)
    expect(ui.getByRole('button', { name: 'Склад' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(ui.getByRole('button', { name: 'Ещё' }))
    const menu = ui.getByRole('dialog', { name: 'Все разделы' })
    expect(within(menu).getByRole('group', { name: 'Склад' })).toBeTruthy()
    fireEvent.click(within(menu).getByRole('button', { name: secondary.tab!.label }))
    expect(onOpen).toHaveBeenCalledWith(secondary.id)
    expect(ui.queryByRole('dialog')).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Ещё' }))
    fireEvent.click(within(ui.getByRole('dialog')).getByRole('button', { name: 'Чат' }))
    expect(onOpen).toHaveBeenCalledWith(messages.id)
    expect(ui.queryByRole('dialog')).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Ещё' }))
    fireEvent.keyDown(ui.getByRole('navigation'), { key: 'Escape' })
    expect(ui.queryByRole('dialog')).toBeNull()
  })
})
