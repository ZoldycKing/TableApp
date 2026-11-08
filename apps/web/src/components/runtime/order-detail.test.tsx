// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { templateExample } from '@/lib/templates/presentation'
import { templateAppPreview } from '@/lib/templates/app-preview'
import { ScreenView } from './screen-view'
import { usesOrderDetail } from './order-detail'

vi.mock('./app-shell', () => ({ EMPTY_LIST_STATE: { query: '', choiceId: null } }))
afterEach(cleanup)

function fixture(role = 'manager') {
  const example = templateExample('zakazy')
  const { runtime, viewer } = templateAppPreview(example, role, role === 'client' ? 'irina@example.com' : 'manager@example.invalid')
  const config = runtime.app.customer!, table = runtime.tables[config.tableId]!
  const screen = runtime.app.screens.find(screen => screen.type === 'detail' && screen.tableId === table.id && (role === 'client' ? screen.id === config.detailScreenId : screen.id !== config.detailScreenId))!
  if (screen.type !== 'detail') throw new Error('Missing order detail')
  return { screen, table, row: table.rows[0]!, collection: null, viewer, accent: 'blue', relatedTitles: runtime.relatedTitles, runtime,
    onOpenRow: vi.fn(), onOpenScreen: vi.fn(), onAction: vi.fn(), onSubmit: vi.fn() }
}

describe('order journey presentation', () => {
  it('does not render an empty receiving section when optional delivery fields were omitted', () => {
    const props = fixture('client'), config = props.runtime.app.customer!
    for (const component of props.screen.components) {
      const id = component.type === 'field' ? component.fieldId : component.type === 'text' && component.source.kind === 'field' ? component.source.fieldId : null
      const field = props.table.fields.find(field => field.id === id)
      if (id === config.logistics!.addressFieldId || field?.type === 'date' || component.type === 'text') if (id) props.row.data[id] = null
    }
    const ui = render(<ScreenView {...props} />)
    expect(ui.queryByRole('region', { name: 'Получение' })).toBeNull()
    expect(ui.getByRole('region', { name: 'Состав заказа' })).toBeTruthy()
  })
  it('groups the permitted order and its actual lines, preserving row navigation and edit actions', () => {
    const props = fixture(), config = props.runtime.app.customer!, cart = config.cart!
    const ui = render(<ScreenView {...props} detailActions={<button>Подтвердить заказ</button>} />)
    const summary = ui.getByRole('region', { name: 'Состояние заказа' })
    expect(within(summary).getByText('Собирается')).toBeTruthy()
    expect(within(summary).getByText(/4[\s\u00a0]670.*₽/)).toBeTruthy()
    expect(within(summary).getByRole('button', { name: 'Подтвердить заказ' })).toBeTruthy()
    const items = ui.getByRole('region', { name: 'Состав заказа' })
    const line = props.runtime.tables[cart.itemsTableId]!.rows.find(row => (props.row.data[cart.positionsFieldId] as string[]).includes(row.id) && row.data[cart.quantityFieldId] === 2)!
    const button = within(items).getByRole('button', { name: new RegExp(String(line.data[cart.nameFieldId])) })
    expect(button.textContent).toContain('2 ×')
    fireEvent.click(button)
    expect(props.onOpenRow).toHaveBeenCalledWith(expect.any(String), line.id)
    expect(ui.getByRole('region', { name: 'Получение' }).textContent).toContain('Получение в магазине')
    expect(ui.getByRole('region', { name: 'Контакты' }).textContent).toContain('+7')
    fireEvent.click(ui.getByRole('button', { name: 'Изменить' }))
    expect(props.onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'open_screen' }))
  })

  it('does not bring removed or conditionally hidden components back from the runtime table', () => {
    const props = fixture(), config = props.runtime.app.customer!
    props.screen.components = props.screen.components.filter(component => component.type !== 'field' || component.fieldId !== config.emailFieldId)
    const total = props.screen.components.find(component => component.type === 'field' && props.table.fields.find(field => field.id === component.fieldId)?.type === 'rollup')!
    total.visibleWhen = { id: 'hide-total', conjunction: 'and', conditions: [{ id: 'cancelled', fieldId: config.statusFieldId, op: 'is', value: config.cancelStatus }] }
    const ui = render(<ScreenView {...props} />)
    expect(ui.queryByText(String(props.row.data[config.emailFieldId]))).toBeNull()
    expect(within(ui.getByRole('region', { name: 'Состояние заказа' })).queryByText(/4[\s\u00a0]670.*₽/)).toBeNull()
  })

  it('keeps the client card free of staff fields and uses the existing authored layout when it contains custom content', () => {
    const props = fixture('client'), ui = render(<ScreenView {...props} />)
    expect(ui.queryByText('Почта исполнителя')).toBeNull()
    expect(ui.queryByRole('button', { name: 'Изменить' })).toBeNull()
    expect(usesOrderDetail(props.screen, props.runtime.app.customer!)).toBe(true)
    props.screen.components.push({ id: 'custom', type: 'heading', source: { kind: 'literal', value: 'Особые условия' }, size: 'm', position: 'z', roles: null, visibleWhen: null })
    ui.rerender(<ScreenView {...props} />)
    expect(ui.getByRole('heading', { name: 'Особые условия' })).toBeTruthy()
    expect(ui.queryByRole('region', { name: 'Состояние заказа' })).toBeNull()
  })

  it('filters a working order list through the existing state without losing its search or changing records', () => {
    const props = fixture(), list = props.runtime.app.screens.find(screen => screen.type === 'list' && props.runtime.views[screen.source.viewId]?.tableId === props.table.id)!
    const onState = vi.fn(), snapshot = JSON.stringify(props.table.rows)
    const ui = render(<ScreenView {...props} screen={list} row={null} collection={{ rows: props.table.rows, shownFields: props.table.fields }} listState={{ query: 'Вектор', choiceId: null }} onListState={onState} />)
    fireEvent.change(ui.getByRole('combobox', { name: 'Статус' }), { target: { value: props.runtime.app.customer!.initialStatus } })
    expect(onState).toHaveBeenCalledWith({ query: 'Вектор', choiceId: props.runtime.app.customer!.initialStatus })
    expect(JSON.stringify(props.table.rows)).toBe(snapshot)
  })

  it('preserves attachment previews and line breaks in additional authored fields', () => {
    const props = fixture()
    props.table.fields.push({ id: 'attachment', tableId: props.table.id, type: 'attachment', name: 'Документы', options: { maxCount: 10 }, description: null, position: 'y' },
      { id: 'multiline', tableId: props.table.id, type: 'long_text', name: 'Условия', options: { richText: false }, description: null, position: 'z' })
    props.row.data.attachment = [{ key: 'synthetic/order.pdf', name: 'Условия поставки.pdf', mime: 'application/pdf', size: 2048 }, { key: 'synthetic/plan.png', name: 'Схема.png', mime: 'image/png', size: 1024 }]
    props.row.data.multiline = 'Первая строка\nВторая строка'
    props.screen.components.push(...['attachment', 'multiline'].map((fieldId, i) => ({ id: fieldId, type: 'field' as const, fieldId, label: null, showWhenEmpty: false, position: `y${i+1}`, roles: null, visibleWhen: null })))
    const ui = render(<ScreenView {...props} />)
    expect(ui.getByRole('img', { name: 'Схема.png' }).getAttribute('src')).toContain('/api/files/')
    expect(ui.getByText('+1 файл(ов)')).toBeTruthy()
    const multiline = ui.getByText(/Первая строка/)
    expect(multiline.textContent).toBe('Первая строка\nВторая строка')
    expect(multiline.className).toContain('whitespace-pre-line')
    expect(ui.queryByText('[object Object]')).toBeNull()
  })
})
