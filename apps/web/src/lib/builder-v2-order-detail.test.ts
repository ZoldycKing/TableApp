import { describe, expect, it } from 'vitest'
import { builderV2DueTone, builderV2OrderDetailParts, builderV2OrderFactKind, builderV2OrderLineProductId, builderV2StatusProgress } from './builder-v2-order-detail'
import type { AppV2, AppV2Node } from '@tableapp/schema/app-v2'

describe('builder v2 order detail composition', () => {
  it('classifies fact labels into contact, delivery, note and reply groups', () => {
    expect(builderV2OrderFactKind('Имя клиента')).toBe('contact')
    expect(builderV2OrderFactKind('Телефон клиента')).toBe('contact')
    expect(builderV2OrderFactKind('Адрес доставки')).toBe('delivery')
    expect(builderV2OrderFactKind('Дата отгрузки')).toBe('delivery')
    expect(builderV2OrderFactKind('Комментарий')).toBe('note')
    expect(builderV2OrderFactKind('Ответ клиенту')).toBe('reply')
  })

  it('builds progress from real choices and hides cancel/return side paths', () => {
    const choices = [
      { id: 'new', label: 'Новый' },
      { id: 'pack', label: 'Собирается' },
      { id: 'ship', label: 'Отгружен' },
      { id: 'done', label: 'Доставлен' },
      { id: 'return', label: 'Возвращён' },
      { id: 'cancel', label: 'Отменён' },
    ]
    const terminals = ['done', 'return', 'cancel']
    expect(builderV2StatusProgress(choices, 'pack', terminals).map(step => [step.label, step.state])).toEqual([
      ['Новый', 'done'], ['Собирается', 'current'], ['Отгружен', 'todo'], ['Доставлен', 'todo'],
    ])
    expect(builderV2StatusProgress(choices, 'done', terminals).map(step => step.state)).toEqual(['done', 'done', 'done', 'current'])
    expect(builderV2StatusProgress(choices, 'cancel', terminals)).toEqual([])
  })

  it('keeps status/amount out of facts and parks the processing form aside', () => {
    const nodes = new Map<string, AppV2Node>([
      ['name', { id: 'name', name: 'Имя', type: 'field', label: 'Имя клиента', visibleTo: null, visibleWhen: null, value: { kind: 'row', fieldId: 'fld_name' } }],
      ['status', { id: 'status', name: 'Статус', type: 'field', label: 'Статус', visibleTo: null, visibleWhen: null, value: { kind: 'row', fieldId: 'fld_status' } }],
      ['total', { id: 'total', name: 'Итого', type: 'field', label: 'Итого', visibleTo: null, visibleWhen: null, value: { kind: 'row', fieldId: 'fld_total' } }],
      ['positions', { id: 'positions', name: 'Позиции', type: 'field', label: 'Позиции', visibleTo: null, visibleWhen: null, value: { kind: 'row', fieldId: 'fld_positions' } }],
      ['form', { id: 'form', name: 'Статус заказа', type: 'form', visibleTo: null, visibleWhen: null, tableId: 'tbl_orders', mode: 'edit', childIds: ['input'], events: { submit: 'act_save' }, submitLabel: 'Сохранить' }],
      ['input', { id: 'input', name: 'Статус', type: 'input', fieldId: 'fld_status', label: 'Статус', required: true, visibleTo: null, visibleWhen: null, initialValue: null }],
      ['cancel', { id: 'cancel', name: 'Отменить', type: 'button', label: 'Отменить заказ', variant: 'danger', visibleTo: null, visibleWhen: null, events: { press: 'act_cancel' } }],
    ])
    const parts = builderV2OrderDetailParts({
      app: { nodes: [...nodes.values()] } as AppV2,
      rootIds: ['name', 'status', 'total', 'positions', 'form', 'cancel'],
      nodes,
      recordTable: { id: 'tbl_orders', name: 'Заказы', primaryFieldId: null, fields: [], views: [] },
      statusFieldId: 'fld_status',
      amountFieldId: 'fld_total',
      positionsFieldId: 'fld_positions',
      statusFormId: 'form',
    })
    expect(parts).toMatchObject({
      factIds: ['name'],
      positionsNodeId: 'positions',
      processingFormId: 'form',
      buttonIds: ['cancel'],
    })
  })

  it('reads product relation ids for optional line photos and skips blanks', () => {
    expect(builderV2OrderLineProductId(['row_product'])).toBe('row_product')
    expect(builderV2OrderLineProductId('row_product')).toBe('row_product')
    expect(builderV2OrderLineProductId('')).toBeUndefined()
    expect(builderV2OrderLineProductId([])).toBeUndefined()
    expect(builderV2OrderLineProductId([null, '  '])).toBeUndefined()
  })

  it('marks overdue and today due dates from calendar days', () => {
    const now = new Date('2026-11-09T12:00:00')
    expect(builderV2DueTone('2026-11-08', now)).toBe('overdue')
    expect(builderV2DueTone('2026-11-09T18:00:00', now)).toBe('today')
    expect(builderV2DueTone('2026-11-10', now)).toBeUndefined()
  })

  it('parks both journal and pencil edit forms outside facts', () => {
    const nodes = new Map<string, AppV2Node>([
      ['client', { id: 'client', name: 'Клиент', type: 'field', label: 'Клиент', visibleTo: null, visibleWhen: null, value: { kind: 'row', fieldId: 'fld_client' } }],
      ['due', { id: 'due', name: 'Срок', type: 'field', label: 'Вернуться к разговору', visibleTo: null, visibleWhen: null, value: { kind: 'row', fieldId: 'fld_due' } }],
      ['stage', { id: 'stage', name: 'Этап', type: 'field', label: 'Этап', visibleTo: null, visibleWhen: null, value: { kind: 'row', fieldId: 'fld_stage' } }],
      ['sum', { id: 'sum', name: 'Сумма', type: 'field', label: 'Сумма, ₽', visibleTo: null, visibleWhen: null, value: { kind: 'row', fieldId: 'fld_sum' } }],
      ['journal', { id: 'journal', name: 'Добавить запись', type: 'form', visibleTo: null, visibleWhen: null, tableId: 'tbl_deals', mode: 'edit', childIds: [], events: { submit: 'act_log' }, submitLabel: 'Сохранить запись' }],
      ['edit', { id: 'edit', name: 'Изменить сделку', type: 'form', visibleTo: null, visibleWhen: null, tableId: 'tbl_deals', mode: 'edit', childIds: [], events: { submit: 'act_edit' }, submitLabel: 'Сохранить' }],
    ])
    const parts = builderV2OrderDetailParts({
      app: { nodes: [...nodes.values()] } as AppV2,
      rootIds: ['client', 'due', 'stage', 'sum', 'journal', 'edit'],
      nodes,
      recordTable: { id: 'tbl_deals', name: 'Сделки', primaryFieldId: null, fields: [], views: [] },
      statusFieldId: 'fld_stage',
      amountFieldId: 'fld_sum',
      dueFieldId: 'fld_due',
      statusFormId: 'journal',
      editFormId: 'edit',
    })
    expect(parts).toMatchObject({
      factIds: ['client'],
      processingFormId: 'journal',
      editFormId: 'edit',
    })
  })
})
