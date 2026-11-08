// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { inventoryFixture } from '@/lib/templates/inventory-fixture.test-utils'
import { plainRecordDetail, RecordDetail } from './record-detail'

afterEach(cleanup)
it('keeps common stock actions visible and leaves only permitted extra actions in the menu', () => {
  const { runtime } = inventoryFixture('manager'), config = runtime.app.inventory!
  const table = runtime.tables[config.tables.items]!, row = table.rows[0]!
  const screen = runtime.app.screens.find(screen => screen.type === 'detail' && screen.tableId === table.id)!
  if (screen.type !== 'detail') throw new Error('Expected stock card')
  const ui = render(<RecordDetail screen={screen} runtime={runtime} primaryFieldId={table.primaryFieldId} ctx={{ fields: table.fields, row, viewer: null, accent: 'blue', relatedTitles: {}, relatedRows: () => [], onAction: vi.fn() }} />)
  expect(ui.getByRole('button', { name: 'Принять товар' }).closest('details')).toBeNull()
  expect(ui.getByRole('button', { name: 'Выдать товар' }).closest('details')).toBeNull()
  expect(ui.getByText('Списать товар').closest('details')).toBeTruthy()
  expect(ui.getByRole('region', { name: 'Сведения' }).querySelector('img')).toBeNull()
  expect(plainRecordDetail(screen, table.primaryFieldId)).toBe(true)
  const custom = { ...screen, components: [...screen.components, { id: 'custom', type: 'heading' as const, source: { kind: 'literal' as const, value: 'Особые условия' }, size: 'l' as const, position: 'z', roles: null, visibleWhen: null }] }
  expect(plainRecordDetail(custom, table.primaryFieldId)).toBe(false)
})
