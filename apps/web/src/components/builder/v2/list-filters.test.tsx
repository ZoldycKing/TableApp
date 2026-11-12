// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BuilderThemeContext } from '../prototype/theme-context'
import { ListFilterToolbar, ListSortControl } from './list-filters'

afterEach(cleanup)

const sortOptions = [{ id: 'popular', label: 'Популярные' }, { id: 'price', label: 'Цена ↑' }]

describe('list sorting controls', () => {
  it('selects an option when a hidden mobile sorting control precedes the desktop control', () => {
    const onSortChange = vi.fn()
    render(<>
      <div hidden><ListSortControl sort="popular" sortOptions={sortOptions} onSortChange={vi.fn()} /></div>
      <ListSortControl sort="popular" sortOptions={sortOptions} onSortChange={onSortChange} />
    </>)
    fireEvent.click(screen.getByRole('button', { name: 'Сортировка: Популярные' }))
    const option = screen.getByRole('option', { name: 'Цена ↑' })
    fireEvent.mouseDown(option)
    fireEvent.click(option)
    expect(onSortChange).toHaveBeenCalledWith('price')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes the sorting menu with Escape and restores focus to its trigger', () => {
    render(<ListSortControl sort="popular" sortOptions={sortOptions} onSortChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Сортировка: Популярные' })
    fireEvent.click(trigger)
    screen.getByRole('option', { name: 'Цена ↑' }).focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('modal list filters', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
      this.querySelector<HTMLButtonElement>('button')?.focus()
    }
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open') }
  })

  it('keeps the app theme in the modal and discards unapplied changes on close', () => {
    const onValuesChange = vi.fn()
    render(<BuilderThemeContext.Provider value={{ className: 'app-theme', scheme: 'dark', style: { '--v2-brand': '#123456' } as React.CSSProperties }}>
      <ListFilterToolbar search="" onSearch={vi.fn()} filters={[{ id: 'status', label: 'Статус', options: [{ id: 'all', label: 'Все' }, { id: 'open', label: 'Открытые' }] }]} values={{ status: 'all' }} onValuesChange={onValuesChange} countMatches={draft => draft.status === 'open' ? 1 : 2} />
    </BuilderThemeContext.Provider>)
    const open = screen.getByRole('button', { name: 'Фильтры' })
    open.focus()
    fireEvent.click(open)
    const dialog = screen.getByRole('dialog', { name: 'Фильтры' })
    expect((dialog as HTMLDialogElement).open).toBe(true)
    expect(dialog.classList.contains('app-theme')).toBe(true)
    expect(dialog.getAttribute('data-scheme')).toBe('dark')
    expect(dialog.style.getPropertyValue('--v2-brand')).toBe('#123456')
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('radio', { name: 'Открытые' }))
    expect(screen.getByRole('button', { name: 'Показать 1' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onValuesChange).not.toHaveBeenCalled()
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(open)
    fireEvent.click(open)
    expect((screen.getByRole('radio', { name: 'Все' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Открытые' }))
    fireEvent.click(screen.getByRole('button', { name: 'Показать 1' }))
    expect(onValuesChange).toHaveBeenCalledWith({ status: 'open' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })
})
