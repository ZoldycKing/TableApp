// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { byPosition, defaultViewConfig, type Field, type View } from '@tableapp/schema'
import { personalApp, putSection, type SectionSource } from '@/lib/app-sections'
import { SectionDialog } from './section-dialog'

const source = (id: string, name: string): SectionSource => {
  const field: Field = { id: `${id}_name`, tableId: id, name: 'Название', type: 'text', options: {}, description: null, position: 'a0' }
  const amount: Field = { id: `${id}_amount`, tableId: id, name: 'Сумма', type: 'number', options: { format: 'plain', precision: 0, currency: 'RUB', showThousandsSeparator: true }, description: null, position: 'a1' }
  return { table: { id, name, primaryFieldId: field.id, fields: [field, amount] }, view: { id: `${id}_view`, tableId: id, name: 'Все записи', position: 'a0', type: 'grid', config: defaultViewConfig('grid', 'f') } as View }
}
const sources = [source('expenses', 'Расходы'), source('projects', 'Проекты')]
const build = () => personalApp({ id: 'app', workspaceId: 'workspace', name: 'Мои дела', slug: 'moi-dela', email: 'me@example.invalid', sources })
const props = () => ({ app: build(), tables: sources.map(source => source.table), views: sources.map(source => source.view), onChange: vi.fn(), onClose: vi.fn() })
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
})
afterEach(cleanup)
describe('simple section settings', () => {
  it('adds a named summary on the chosen table, with an icon, only when confirmed', () => {
    const input = props()
    render(<SectionDialog {...input} />)
    fireEvent.change(screen.getByLabelText('Таблица'), { target: { value: 'projects' } })
    fireEvent.change(screen.getByLabelText('Название раздела'), { target: { value: 'Мои планы' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сводка' }))
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать иконку раздела' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Иконка раздела' })).getByRole('button', { name: 'Календарь' }))
    expect(input.onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Добавить раздел' }))
    const [app, id] = input.onChange.mock.calls[0]!
    expect(app.screens.find((screen: { id: string }) => screen.id === id)).toMatchObject({ type: 'dashboard', name: 'Мои планы', tab: { label: 'Мои планы', icon: 'calendar' } })
    expect(input.onClose).toHaveBeenCalledOnce()
  })
  it('renames a section, switches its view and changes order without losing navigation IDs', () => {
    const input = props(), root = input.app.screens.find(screen => screen.tab)!
    render(<SectionDialog {...input} screen={root} />)
    fireEvent.change(screen.getByLabelText('Название раздела'), { target: { value: 'Мой бюджет' } })
    fireEvent.click(screen.getByRole('button', { name: 'Карточки' }))
    fireEvent.click(screen.getByRole('button', { name: 'Поля и порядок' }))
    fireEvent.change(screen.getByLabelText('Положение в меню'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
    const [app, id] = input.onChange.mock.calls[0]!
    expect(id).toBe(root.id)
    expect(app.screens.find((screen: { id: string }) => screen.id === id)).toMatchObject({ type: 'tiles', name: 'Мой бюджет' })
    expect(app.screens.filter((screen: { tab: unknown }) => screen.tab).sort(byPosition)[1].id).toBe(root.id)
  })
  it('lets the user explicitly choose a sum and its numeric column for a summary', () => {
    const input = props()
    render(<SectionDialog {...input} />)
    fireEvent.click(screen.getByRole('button', { name: 'Сводка' }))
    fireEvent.change(screen.getByLabelText('Показатель'), { target: { value: 'sum' } })
    fireEvent.click(screen.getByRole('button', { name: 'Поля и порядок' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Открывать этот раздел при запуске' }))
    fireEvent.click(screen.getByRole('button', { name: 'Добавить раздел' }))
    const [app, id] = input.onChange.mock.calls[0]!
    expect(app.homeScreenId).toBe(id)
    expect(app.screens.find((screen: { id: string }) => screen.id === id).blocks).toContainEqual(expect.objectContaining({ type: 'metric', kind: 'sum', fieldId: 'expenses_amount' }))
  })
  it('removes only the section after confirmation and explains that records are retained', () => {
    const input = props(), root = input.app.screens.find(screen => screen.tab)!
    render(<SectionDialog {...input} screen={root} />)
    fireEvent.click(screen.getByRole('button', { name: 'Удалить раздел' }))
    expect(screen.getByText(/Таблица и записи сохранятся/)).toBeTruthy()
    expect(input.onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Удалить раздел' }))
    expect(input.onChange.mock.calls[0]![0].screens.some((screen: { sectionId: string }) => screen.sectionId === root.id)).toBe(false)
  })
  it('cancels without changing the application and restores background scrolling', () => {
    const input = props()
    const ui = render(<SectionDialog {...input} />)
    fireEvent.change(screen.getByLabelText('Название раздела'), { target: { value: 'Не сохранять' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(input.onChange).not.toHaveBeenCalled()
    expect(input.onClose).toHaveBeenCalledOnce()
    ui.unmount()
    expect(document.body.style.overflow).toBe('')
  })
  it('preserves custom form fields when renaming its section', () => {
    const input = props()
    const created = putSection(input.app, { source: sources[0]!, type: 'form', name: 'Расход', icon: 'plus' })
    const form = created.app.screens.find(screen => screen.id === created.screenId)!
    if (form.type !== 'form') throw new Error('Expected a form')
    const edited = { ...form, components: form.components.map(item => item.type === 'form_field' ? { ...item, label: 'Мой заголовок', required: true } : item) }
    render(<SectionDialog {...input} app={{ ...created.app, screens: created.app.screens.map(screen => screen.id === edited.id ? edited : screen) }} screen={edited} />)
    fireEvent.change(screen.getByLabelText('Название раздела'), { target: { value: 'Записать расход' } })
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
    expect(input.onChange.mock.calls[0]![0].screens.find((screen: { id: string }) => screen.id === edited.id).components).toEqual(edited.components)
  })
})
