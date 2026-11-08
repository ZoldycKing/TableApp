import { describe, expect, it } from 'vitest'
import { builderV2OrderDetailParts, builderV2OrderFactKind, builderV2StatusProgress } from './builder-v2-order-detail'
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
      recordTable: { id: 'tbl_orders', name: 'Заказы', fields: [], views: [] },
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
})
