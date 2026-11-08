// @vitest-environment jsdom
vi.mock('@/app/builder-v2-form-actions', () => ({ inspectBuilderV2FormAction: vi.fn() }))
import { fireEvent, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppV2Record } from '@tableapp/schema/app-v2'
import { appV2Fixture, fixtureActor, fixtureTables } from './fixture.test-utils'
import { AppV2Renderer } from './view'

vi.mock('../prototype/icons', () => ({ ProtoIcon: () => null }))
vi.mock('@/app/builder-v2-data-actions', () => ({ readBuilderV2DataAction: vi.fn() }))
afterEach(cleanup)

const row = (id: string, amount: number): AppV2Record => ({ tableId: 'requests', id, values: { r_title: `Заявка ${id}`, r_status: 'В работе', r_amount: amount } })

describe('shared v2 layout renderer', () => {
  it('does not repeat the screen title above its only list, while keeping distinct block titles and editor labels', () => {
    const app = appV2Fixture(), list = app.nodes.find(node => node.id === 'request_list')!, home = app.screens.find(screen => screen.id === 'home')!
    home.rootIds = [list.id]; home.name = list.name
    const props = { app, screenId: home.id, tables: fixtureTables, actor: fixtureActor, rows: { requests_source: [row('один', 10)] } }
    const view = render(<AppV2Renderer {...props} />)
    expect(screen.queryByRole('heading', { name: list.name })).toBeNull()
    view.rerender(<AppV2Renderer {...props} editing />)
    expect(screen.getByRole('heading', { name: list.name })).toBeTruthy()
    view.rerender(<AppV2Renderer {...props} app={{ ...app, screens: app.screens.map(page => page.id === home.id ? { ...page, name: 'Рабочая сводка' } : page) }} />)
    expect(screen.getByRole('heading', { name: list.name })).toBeTruthy()
  })

  it('uses the same content and row context in edit and preview modes, with controls only in the editor', () => {
    const app = appV2Fixture()
    app.nodes.push({ id: 'row_title', type: 'heading', name: 'Заголовок строки', visibleTo: null, visibleWhen: null, size: 's', value: { kind: 'row', fieldId: 'r_title' } })
    const collection = app.nodes.find(node => node.id === 'request_list')!
    if (collection.type === 'collection') collection.itemIds = ['row_title']
    const props = { app, screenId: 'home', tables: fixtureTables, actor: fixtureActor, rows: { requests_source: [row('один', 10), row('два', 20)] } }
    const view = render(<AppV2Renderer {...props} editing />)
    expect(screen.getByRole('heading', { name: 'Заявка один' }).textContent).toBe('Заявка один')
    expect(screen.getByRole('heading', { name: 'Заявка два' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Выбрать элемент/ }).length).toBeGreaterThan(0)
    view.rerender(<AppV2Renderer {...props} />)
    expect(screen.getByRole('heading', { name: 'Заявка один' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Выбрать элемент/ })).toBeNull()
  })

  it('renders semantic table columns and distinguishes unloaded data from an authorized empty result', () => {
    const app = appV2Fixture(), collection = app.nodes.find(node => node.id === 'request_list')!
    if (collection.type === 'collection') collection.layout = 'table'
    const props = { app, screenId: 'home', tables: fixtureTables, actor: fixtureActor }
    const view = render(<AppV2Renderer {...props} />)
    expect(within(screen.getByRole('table', { name: 'Заявки' })).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['r_title', 'r_status'])
    expect(screen.queryByText('Нет доступных записей')).toBeNull()
    view.rerender(<AppV2Renderer {...props} rows={{ requests_source: [] }} />)
    expect(screen.getByText('Нет доступных записей')).toBeTruthy()
    view.rerender(<AppV2Renderer {...props} rows={{ requests_source: [row('один', 10)] }} />)
    expect(within(screen.getByRole('table', { name: 'Заявки' })).getByRole('cell', { name: 'Заявка один' })).toBeTruthy()
  })

  it('keeps one heading for a group that spans several loaded portions', () => {
    const app = appV2Fixture(), collection = app.nodes.find(node => node.id === 'request_list')!
    if (collection.type !== 'collection') throw new Error('fixture')
    const grouped = (id: string, key: string, label: string) => ({ ...row(id, 10), group: { key, label } })
    const first = grouped('1', 'working', 'В работе сегодня')
    const second = grouped('2', 'working', 'В работе сегодня')
    const third = grouped('3', 'done', 'Завершены')
    const props = { app, screenId: 'home', tables: fixtureTables, actor: fixtureActor }
    const view = render(<AppV2Renderer {...props} rows={{ requests_source: [first] }} />)
    view.rerender(<AppV2Renderer {...props} rows={{ requests_source: [first, second, third] }} />)
    expect(screen.getAllByRole('heading', { name: 'В работе сегодня' })).toHaveLength(1)
    expect(screen.getByText('Заявка 2')).toBeTruthy()
    collection.layout = 'table'
    view.rerender(<AppV2Renderer {...props} rows={{ requests_source: [first, second, third] }} />)
    const table = within(screen.getByRole('table', { name: 'Заявки' }))
    expect(table.getAllByRole('rowheader').map(heading => heading.textContent)).toEqual(['В работе сегодня', 'Завершены'])
  })

  it.each([['count', 3], ['sum', 60], ['avg', 20], ['min', 10], ['max', 30]] as const)('calculates %s only from provided authorized records', (operation, expected) => {
    const app = appV2Fixture(), metric = app.nodes.find(node => node.id === 'requests_count')!
    if (metric.type === 'metric') { metric.operation = operation; metric.fieldId = operation === 'count' ? null : 'r_amount' }
    const view = render(<AppV2Renderer app={app} screenId="home" tables={fixtureTables} actor={fixtureActor} rows={{ requests_source: [row('1', 10), row('2', 20), row('3', 30)] }} />)
    expect(view.container.querySelector('[data-kind="metric"] strong')?.textContent).toBe(String(expected))
  })

  it('opens records only for complete navigation workflows, leaving mutation chains disabled', () => {
    const app = appV2Fixture(), onNavigate = vi.fn(), props = { app, screenId: 'home', tables: fixtureTables, actor: fixtureActor, rows: { requests_source: [row('one', 10)] }, onNavigate }
    const view = render(<AppV2Renderer {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Заявка one/ }))
    expect(onNavigate).toHaveBeenCalledWith('detail', 'one')
    view.rerender(<AppV2Renderer {...props} editing />)
    expect(screen.queryByRole('button', { name: /Заявка one/ })).toBeNull()
    const flow = app.workflows.find(flow => flow.id === 'open_request')!
    flow.steps.unshift({ id: 'write', type: 'update_row', tableId: 'requests', target: { kind: 'current' }, values: { r_title: { kind: 'literal', value: 'Не выполнять' } } })
    view.rerender(<AppV2Renderer {...props} />)
    expect(screen.queryByRole('button', { name: /Заявка one/ })).toBeNull()
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })
  it('renders the supplied photo and formatted value on a catalog card and opens its record', () => {
    const app = appV2Fixture(), list = app.nodes.find(node => node.id === 'request_list')
    if (list?.type !== 'collection') throw new Error('fixture')
    list.layout = 'cards'; list.cardImageFieldId = 'r_photo'; list.cardDetailFieldId = 'r_amount'
    const photo = 'https://example.invalid/catalog/photo.webp'
    const visible = { ...row('one', 1290), values: { ...row('one', 1290).values, r_photo: photo }, display: { r_amount: '1 290 ₽' } }
    const onNavigate = vi.fn()
    const view = render(<AppV2Renderer app={app} screenId="home" tables={fixtureTables} actor={fixtureActor} rows={{ requests_source: [visible, row('two', 500)] }} onNavigate={onNavigate} />)
    const card = screen.getByRole('button', { name: /Заявка one/ })
    expect(card.textContent).toContain('1 290 ₽')
    expect(card.querySelector('img')?.getAttribute('src')).toBe(photo)
    expect(screen.getByRole('button', { name: /Заявка two/ }).querySelector('img')).toBeNull()
    fireEvent.click(card)
    expect(onNavigate).toHaveBeenCalledWith('detail', 'one')
    expect(view.container.querySelector('button button')).toBeNull()
  })
  it('lays out a catalog detail and keeps fields omitted from the record out of its hero', () => {
    const app = appV2Fixture(), detail = app.screens.find(page => page.id === 'detail')!
    detail.catalog = { titleFieldId: 'r_title', imageFieldId: 'r_photo', priceFieldId: 'r_amount', descriptionFieldId: 'r_description' }
    detail.rootIds = ['catalog_spec']
    app.nodes.push({ id: 'catalog_spec', name: 'Статус', type: 'field', label: 'Статус', visibleTo: null, visibleWhen: null, value: { kind: 'row', fieldId: 'r_status' } })
    const table = fixtureTables.find(item => item.id === 'requests')!
    const tables = [{ ...table, fields: table.fields.map(field => field.id === 'r_amount' ? { ...field, name: 'Цена, ₽' } : field) }]
    const record = { ...row('one', 1290), values: { ...row('one', 1290).values, r_title: 'Настольная лампа', r_photo: 'https://example.invalid/lamp.webp', r_description: 'Тёплый свет' } }
    const props = { app, screenId: 'detail', tables, actor: fixtureActor }
    const view = render(<AppV2Renderer {...props} record={record} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Настольная лампа' })).toBeTruthy()
    expect(screen.getByText('1 290 ₽')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Открыть фото 1: Настольная лампа' })).toBeTruthy()
    expect(screen.getByText('Тёплый свет')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Характеристики' })).toBeTruthy()
    const limited = { ...record, values: { r_title: 'Настольная лампа' }, display: { r_amount: '1 290 ₽', r_description: 'Тёплый свет' } }
    view.rerender(<AppV2Renderer {...props} record={limited} />)
    expect(screen.queryByText('1 290 ₽')).toBeNull()
    expect(screen.queryByText('Тёплый свет')).toBeNull()
    expect(screen.queryByRole('button', { name: /Открыть фото/ })).toBeNull()
  })
  it('keeps parent card bindings separate inside a repeated row and avoids nested buttons', () => {
    const app = appV2Fixture(), list = app.nodes.find(node => node.id === 'request_list')!
    if (list.type !== 'collection') throw new Error('fixture')
    list.itemIds = ['parent_title', 'item_title', 'nested_button']
    app.nodes.push({ id: 'parent_title', name: 'Папка', type: 'text', value: { kind: 'screen_row', fieldId: 'r_title' }, visibleTo: null, visibleWhen: null }, { id: 'item_title', name: 'Строка', type: 'text', value: { kind: 'row', fieldId: 'r_title' }, visibleTo: null, visibleWhen: null }, { id: 'nested_button', name: 'Действие', type: 'button', label: 'Изменить', variant: 'secondary', events: { press: null }, visibleTo: null, visibleWhen: null })
    const view = render(<AppV2Renderer app={app} screenId="home" tables={fixtureTables} actor={fixtureActor} record={row('parent', 20)} rows={{ requests_source: [row('child', 10)] }} onNavigate={vi.fn()} />)
    expect(screen.getByText('Заявка parent')).toBeTruthy(); expect(screen.getByText('Заявка child')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Открыть запись' })).toBeTruthy()
    expect(view.container.querySelector('button button')).toBeNull()
  })

  it('never enables form submission or mutation buttons in layout preview', () => {
    const app = appV2Fixture()
    const view = render(<AppV2Renderer app={app} screenId="new" tables={fixtureTables} actor={fixtureActor} />)
    expect((screen.getByRole('button', { name: 'Проверить форму' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Сумма, ₽') as HTMLInputElement).disabled).toBe(true)
    view.rerender(<AppV2Renderer app={app} screenId="detail" tables={fixtureTables} actor={fixtureActor} />)
    expect((screen.getByRole('button', { name: 'Завершить заявку' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
