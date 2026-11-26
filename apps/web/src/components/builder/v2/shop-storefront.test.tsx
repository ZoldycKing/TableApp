// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appV2Schema, type AppV2Record } from '@tableapp/schema/app-v2'
import { buildTemplate } from '@/lib/templates/build'
import { findTemplate } from '@/lib/templates/catalog'
import { buildShopV2App } from '@/lib/templates/shop-v2'
import { ShopCatalogShell } from './shop-storefront'
import { BuilderV2CatalogDetail } from './catalog-detail'
import { BuilderV2AppearanceSettings } from './appearance-settings'

vi.mock('@/app/builder-v2-data-actions', () => ({ readBuilderV2DataAction: vi.fn() }))
vi.mock('../prototype/icons', () => ({ ProtoIcon: () => null }))
afterEach(cleanup)
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})

function fixture() {
  const built = buildTemplate({ template: findTemplate('zakazy')!, workspaceId: 'wsp_shop' })
  const app = buildShopV2App(built, { id: 'app_shop', workspaceId: 'wsp_shop', name: 'Магазин', slug: 'shop', email: 'owner@example.com' })
  const shop = app.shop!
  shop.stockFieldId = 'stock'
  shop.categoryFieldId = 'category'
  const row = (id: string, category: string, stock: number, price: number): AppV2Record => ({ id, tableId: shop.catalogTableId, values: {
    [shop.productTitleFieldId]: id, category, stock, [shop.priceFieldId]: price, [shop.activeFieldId]: true,
  } })
  return { app, rows: [row('Лампа', 'Освещение', 4, 3490), row('Блокнот', 'Канцтовары', 20, 590), row('Коврик', 'Аксессуары', 0, 890)] }
}
function Catalog() {
  const { app, rows } = fixture()
  const [search, onSearch] = useState('')
  return <ShopCatalogShell app={app} rows={rows} total={rows.length} search={search} onSearch={onSearch} onOpen={vi.fn()} />
}

describe('shop filter experience', () => {
  it('combines categories with OR, then availability and inclusive price bounds with AND', () => {
    render(<Catalog />)
    const sidebar = within(screen.getByRole('complementary', { name: 'Фильтры каталога' }))
    fireEvent.click(sidebar.getByRole('checkbox', { name: /Освещение/ }))
    fireEvent.click(sidebar.getByRole('checkbox', { name: /Канцтовары/ }))
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByText('Осталось 4 шт.')).toBeTruthy()
    fireEvent.click(sidebar.getByRole('checkbox', { name: 'Только в наличии' }))
    expect(screen.getAllByRole('article')).toHaveLength(2)
    fireEvent.change(sidebar.getByRole('spinbutton', { name: 'Цена от' }), { target: { value: '590' } })
    fireEvent.change(sidebar.getByRole('spinbutton', { name: 'Цена до' }), { target: { value: '590' } })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(within(screen.getByRole('article')).getAllByText('Блокнот').length).toBeGreaterThan(0)
    fireEvent.click(sidebar.getByRole('button', { name: 'Сбросить' }))
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(sidebar.queryByText('Мало')).toBeNull()
  })

  it('removes an individual category without clearing the other conditions', () => {
    render(<Catalog />)
    const sidebar = within(screen.getByRole('complementary'))
    fireEvent.click(sidebar.getByRole('checkbox', { name: /Освещение/ }))
    fireEvent.click(sidebar.getByRole('checkbox', { name: /Канцтовары/ }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Категории: Освещение' })[0]!)
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect((sidebar.getByRole('checkbox', { name: /Канцтовары/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('stages mobile choices, rejects reversed price bounds, and applies multiple categories together', () => {
    render(<Catalog />)
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('checkbox', { name: /Освещение/ }))
    fireEvent.click(dialog.getByRole('checkbox', { name: /Канцтовары/ }))
    expect(screen.getAllByRole('article')).toHaveLength(3)
    fireEvent.change(dialog.getByRole('spinbutton', { name: 'Цена от' }), { target: { value: '1000' } })
    fireEvent.change(dialog.getByRole('spinbutton', { name: 'Цена до' }), { target: { value: '500' } })
    expect((dialog.getByRole('button', { name: 'Показать 0' }) as HTMLButtonElement).disabled).toBe(true)
    expect(dialog.getByRole('alert').textContent).toContain('не меньше')
    fireEvent.change(dialog.getByRole('spinbutton', { name: 'Цена от' }), { target: { value: '' } })
    fireEvent.change(dialog.getByRole('spinbutton', { name: 'Цена до' }), { target: { value: '' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Показать 2' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })
})

describe('business stock threshold', () => {
  it('keeps the same exact stock message on the card and detail and responds to a changed threshold', () => {
    const { app, rows } = fixture()
    const props = { catalog: app.screens.find(item => item.id === app.shop!.detailScreenId)!.catalog!, shop: app.shop!, record: rows[0]! }
    const view = render(<BuilderV2CatalogDetail {...props} />)
    expect(screen.getByText('Осталось 4 шт.')).toBeTruthy()
    view.rerender(<BuilderV2CatalogDetail {...props} shop={{ ...props.shop, lowStockThreshold: 4 }} />)
    expect(screen.getByText('В наличии')).toBeTruthy()
    expect(screen.queryByText('Осталось 4 шт.')).toBeNull()
  })
  it('saves a valid threshold in the definition without changing access or stock', () => {
    const { app } = fixture(), onChange = vi.fn()
    render(<BuilderV2AppearanceSettings app={app} onChange={onChange} onScreens={vi.fn()} onUploadLogo={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Магазин' }))
    const input = screen.getByRole('spinbutton', { name: 'Показывать количество, когда осталось меньше' })
    fireEvent.change(input, { target: { value: '10' } })
    const next = onChange.mock.calls.at(-1)![0]
    expect(appV2Schema.parse(next).shop?.lowStockThreshold).toBe(10)
    expect(next.policy).toEqual(app.policy)
    expect(next.shop.stockFieldId).toBe(app.shop!.stockFieldId)
    onChange.mockClear()
    fireEvent.change(input, { target: { value: '0' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(appV2Schema.safeParse({ ...app, shop: { ...app.shop, lowStockThreshold: -1 } }).success).toBe(false)
    const legacy = { ...app, shop: { ...app.shop } }
    delete legacy.shop.lowStockThreshold
    expect(appV2Schema.safeParse(legacy).success).toBe(true)
  })
})
