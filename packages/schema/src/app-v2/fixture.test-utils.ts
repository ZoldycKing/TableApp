import { appV2Schema, type AppV2 } from './schema'
import type { AppV2Catalog } from './validate'

export const v2Catalog: AppV2Catalog = {
  workspaceId: 'workspace',
  tables: new Map(['requests', 'tasks', 'history'].map(id => [id, { workspaceId: 'workspace' }])),
  views: new Map([['requests_view', { tableId: 'requests' }], ['tasks_view', { tableId: 'tasks' }]]),
  fields: new Map([
    ['r_title', { tableId: 'requests', type: 'text' }], ['r_status', { tableId: 'requests', type: 'text' }], ['r_owner', { tableId: 'requests', type: 'email' }],
    ['r_amount', { tableId: 'requests', type: 'number' }], ['r_total', { tableId: 'requests', type: 'formula' }],
    ['t_title', { tableId: 'tasks', type: 'text' }], ['t_owner', { tableId: 'tasks', type: 'email' }],
    ['h_title', { tableId: 'history', type: 'text' }], ['h_request', { tableId: 'history', type: 'text' }], ['h_owner', { tableId: 'history', type: 'email' }],
  ]),
}
const roles = { kind: 'roles', roleIds: ['owner', 'worker'] }
const all = { kind: 'all' }, owned = { kind: 'owned', fieldId: 'r_owner', property: 'email' }
const literal = (value: string) => ({ kind: 'literal', value })

/** Same pilot as the editor, expressed as real contracts rather than its browser-only model. */
export function appV2Fixture(): AppV2 {
  return appV2Schema.parse({
    formatVersion: 2, id: 'app_pilot', workspaceId: 'workspace', name: 'Рабочие заявки', slug: 'working-requests', purpose: 'business', theme: {},
    roles: [{ id: 'owner', name: 'Руководитель' }, { id: 'worker', name: 'Сотрудник' }],
    authentication: { mode: 'invite_only', defaultRoleId: null, members: [{ email: 'anna@example.com', roleIds: ['worker'], company: '' }] }, homeScreenId: 'home',
    screens: [
      { id: 'home', name: 'Обзор', icon: 'home', navigation: true, audience: roles, contextTableId: null, rootIds: ['welcome', 'metrics', 'request_list', 'task_list'], events: { enter: null } },
      { id: 'detail', name: 'Заявка', icon: 'list', navigation: false, audience: roles, contextTableId: 'requests', rootIds: ['request_title', 'complete_button'], events: { enter: null } },
      { id: 'new', name: 'Новая заявка', icon: 'plus', navigation: true, audience: roles, contextTableId: null, rootIds: ['create_form'], events: { enter: null } },
      { id: 'task_detail', name: 'Задача', icon: 'list', navigation: false, audience: roles, contextTableId: 'tasks', rootIds: ['task_title'], events: { enter: null } },
    ],
    nodes: [
      { id: 'welcome', type: 'heading', name: 'Заголовок', value: literal('Всё под рукой') },
      { id: 'metrics', type: 'columns', name: 'Показатели', columns: 2, childIds: ['requests_count', 'tasks_count'] },
      { id: 'requests_count', type: 'metric', name: 'Заявок', sourceId: 'requests_source', operation: 'count', fieldId: null },
      { id: 'tasks_count', type: 'metric', name: 'Задач', sourceId: 'tasks_source', operation: 'count', fieldId: null },
      { id: 'request_list', type: 'collection', name: 'Заявки', sourceId: 'requests_source', layout: 'list', titleFieldId: 'r_title', subtitleFieldId: 'r_status', itemIds: [], events: { itemPress: 'open_request' } },
      { id: 'task_list', type: 'collection', name: 'Задачи', sourceId: 'tasks_source', layout: 'cards', titleFieldId: 't_title', subtitleFieldId: null, itemIds: [], events: { itemPress: 'open_task' } },
      { id: 'request_title', type: 'field', name: 'Название', label: 'Название', value: { kind: 'row', fieldId: 'r_title' } },
      { id: 'task_title', type: 'field', name: 'Задача', label: 'Название', value: { kind: 'row', fieldId: 't_title' } },
      { id: 'complete_button', type: 'button', name: 'Завершить', label: 'Завершить заявку', events: { press: 'complete' } },
      { id: 'create_form', type: 'form', name: 'Новая заявка', tableId: 'requests', mode: 'create', childIds: ['title_input', 'amount_input'], events: { submit: 'create' } },
      { id: 'title_input', type: 'input', name: 'Название', fieldId: 'r_title', label: 'Название', required: true, initialValue: null },
      { id: 'amount_input', type: 'input', name: 'Сумма', fieldId: 'r_amount', label: 'Сумма, ₽', required: false, initialValue: null },
    ],
    sources: [
      { id: 'requests_source', tableId: 'requests', viewId: 'requests_view', filter: null, sorts: [], searchFieldIds: ['r_title'], pageSize: 30 },
      { id: 'tasks_source', tableId: 'tasks', viewId: 'tasks_view', filter: null, sorts: [], searchFieldIds: ['t_title'], pageSize: 30 },
    ],
    workflows: [
      { id: 'open_request', name: 'Открыть заявку', input: { rowTableId: 'requests', formId: null }, steps: [{ id: 'open', type: 'open_screen', screenId: 'detail', record: { kind: 'current' } }] },
      { id: 'open_task', name: 'Открыть задачу', input: { rowTableId: 'tasks', formId: null }, steps: [{ id: 'open', type: 'open_screen', screenId: 'task_detail', record: { kind: 'current' } }] },
      { id: 'complete', name: 'Завершить заявку', input: { rowTableId: 'requests', formId: null }, steps: [
        { id: 'check', type: 'require', condition: { op: 'not_empty', value: { kind: 'row', fieldId: 'r_title' } }, message: 'Заполните название' },
        { id: 'close', type: 'update_row', tableId: 'requests', target: { kind: 'current' }, values: { r_status: literal('Готово') } },
        { id: 'log', type: 'create_row', tableId: 'history', values: { h_title: { kind: 'row', fieldId: 'r_title' }, h_request: { kind: 'result_id', stepId: 'close' } } },
        { id: 'notice', type: 'notify', message: literal('Заявка завершена') },
      ] },
      { id: 'create', name: 'Создать заявку', input: { rowTableId: null, formId: 'create_form' }, steps: [
        { id: 'new_request', type: 'create_row', tableId: 'requests', values: { r_title: { kind: 'form', formId: 'create_form', fieldId: 'r_title' }, r_amount: { kind: 'form', formId: 'create_form', fieldId: 'r_amount' } } },
        { id: 'notice', type: 'notify', message: { kind: 'result', stepId: 'new_request', fieldId: 'r_title' } },
        { id: 'open', type: 'open_screen', screenId: 'detail', record: { kind: 'result', stepId: 'new_request' } },
      ] },
    ],
    policy: { tables: [
      { tableId: 'requests', grants: [
        { audience: { kind: 'roles', roleIds: ['owner'] }, read: { fieldIds: ['r_title', 'r_status', 'r_owner', 'r_amount', 'r_total'], rows: all }, create: { fieldIds: ['r_title', 'r_status', 'r_amount'], owner: { fieldId: 'r_owner', property: 'email' } }, update: { fieldIds: ['r_title', 'r_status', 'r_amount', 'r_owner'], rows: all }, delete: { rows: all } },
        { audience: { kind: 'roles', roleIds: ['worker'] }, read: { fieldIds: ['r_title', 'r_status', 'r_owner'], rows: owned }, create: { fieldIds: ['r_title', 'r_status', 'r_amount'], owner: { fieldId: 'r_owner', property: 'email' } }, update: { fieldIds: ['r_title', 'r_status', 'r_owner'], rows: owned } },
      ] },
      { tableId: 'tasks', grants: [{ audience: roles, read: { fieldIds: ['t_title', 't_owner'], rows: { kind: 'owned', fieldId: 't_owner', property: 'email' } } }] },
      { tableId: 'history', grants: [
        { audience: { kind: 'roles', roleIds: ['owner'] }, read: { fieldIds: ['h_title', 'h_request'], rows: all }, create: { fieldIds: ['h_title', 'h_request'], owner: { fieldId: 'h_owner', property: 'email' } } },
        { audience: { kind: 'roles', roleIds: ['worker'] }, read: { fieldIds: ['h_title', 'h_request'], rows: { kind: 'owned', fieldId: 'h_owner', property: 'email' } }, create: { fieldIds: ['h_title', 'h_request'], owner: { fieldId: 'h_owner', property: 'email' } } },
      ] },
    ], workflows: ['open_request', 'open_task', 'complete', 'create'].map(workflowId => ({ workflowId, audience: roles })) },
  })
}
