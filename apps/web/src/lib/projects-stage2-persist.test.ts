import { describe, expect, it } from 'vitest'
import type { AppV2Actor, AppV2Record } from '@tableapp/schema/app-v2'
import { buildTemplate } from './templates/build'
import { findTemplate } from './templates/catalog'
import { buildProjectsV2App } from './templates/projects-v2'
import {
  commentWrite, guardProjectsCreate, guardProjectsDelete, guardProjectsUpdate, linkWrite, shareWrite, templateWrite, timeWrite,
} from './projects-persist'
import {
  canLinkTasks, canStartTimer, entryMinutes, serializeTemplatePayload, totalSpentMinutes, validateManualMinutes,
} from './projects-stage2'

const actor = (roleIds: string[], email: string): AppV2Actor => ({ authenticated: true, roleIds, id: 'usr', email, company: '', name: 'Анна' })

function installed() {
  const built = buildTemplate({ template: findTemplate('proekty')!, workspaceId: 'wsp_projects' })
  const app = buildProjectsV2App(built, { id: 'app_projects', workspaceId: 'wsp_projects', name: 'Проекты', slug: 'proekty', email: 'owner@example.invalid' })
  return { app, kit: app.projects! }
}

describe('stage 2 persist wiring', () => {
  it('lets the lead create dependency links that canLinkTasks accepts and blocks cycles and the client', () => {
    const { app, kit } = installed()
    expect(kit.link && kit.linksTableId).toBeTruthy()
    const allowed = canLinkTasks([], 'task_a', 'task_b')
    expect(allowed).toEqual({ ok: true })
    const values = linkWrite(kit.link!, { title: 'Макет → Верстка', projectId: 'project', fromId: 'task_a', toId: 'task_b' })
    expect(values[kit.link!.from]).toEqual(['task_a'])
    expect(values[kit.link!.to]).toEqual(['task_b'])
    expect(guardProjectsCreate(app, actor(['owner'], 'owner@example.invalid'), kit.linksTableId!, values).ok).toBe(true)
    expect(guardProjectsCreate(app, actor(['staff'], 'anna@example.invalid'), kit.linksTableId!, values).ok).toBe(false)
    expect(guardProjectsCreate(app, actor(['client'], 'client@example.invalid'), kit.linksTableId!, values).ok).toBe(false)
    expect(canLinkTasks([{ id: '1', fromId: 'task_a', toId: 'task_b' }], 'task_b', 'task_a').ok).toBe(false)
    const linkRow: AppV2Record = { id: 'link', tableId: kit.linksTableId!, values }
    expect(guardProjectsDelete(app, actor(['owner'], 'owner@example.invalid'), linkRow).ok).toBe(true)
    expect(guardProjectsDelete(app, actor(['staff'], 'anna@example.invalid'), linkRow).ok).toBe(false)
  })

  it('writes time rows for the assignee and keeps totals aligned with entryMinutes', () => {
    const { app, kit } = installed()
    expect(kit.time && kit.timeTableId).toBeTruthy()
    const now = Date.parse('2026-11-18T12:00:00.000Z')
    const values = timeWrite(kit.time!, {
      taskId: 'task', projectId: 'project', personId: 'anna', email: 'anna@example.invalid',
      startedAt: '2026-11-18T11:00:00.000Z', endedAt: null, minutes: null, note: '',
    })
    const payload = { ...values }
    delete payload[kit.time!.email]
    const created = guardProjectsCreate(app, actor(['staff'], 'anna@example.invalid'), kit.timeTableId!, payload)
    expect(created.ok && created.ownerValues[kit.time!.email]).toBe('anna@example.invalid')
    expect(guardProjectsCreate(app, actor(['client'], 'client@example.invalid'), kit.timeTableId!, values).ok).toBe(false)
    const entries = [
      { id: '1', taskId: 'task', email: 'anna@example.invalid', startedAt: '2026-11-18T10:00:00.000Z', endedAt: '2026-11-18T10:30:00.000Z', minutes: 30, note: '' },
      { id: '2', taskId: 'task', email: 'anna@example.invalid', startedAt: '2026-11-18T11:00:00.000Z', endedAt: null, minutes: null, note: '' },
    ]
    expect(entryMinutes(entries[1]!, now)).toBe(60)
    expect(totalSpentMinutes(entries, 'task', now)).toBe(90)
    expect(canStartTimer(entries, 'anna@example.invalid', 'other').ok).toBe(false)
    expect(validateManualMinutes(45)).toEqual({ ok: true, minutes: 45 })
    const closed = timeWrite(kit.time!, {
      taskId: 'task', projectId: 'project', personId: 'anna', email: 'anna@example.invalid',
      startedAt: '2026-11-18T09:00:00.000Z', endedAt: '2026-11-18T09:45:00.000Z', minutes: 45, note: 'Ручная запись',
    })
    const stopPayload = { [kit.time!.endedAt]: '2026-11-18T12:00:00.000Z', [kit.time!.minutes]: 60 }
    const row: AppV2Record = { id: 'time', tableId: kit.timeTableId!, values: { ...values, [kit.time!.email]: 'anna@example.invalid' } }
    expect(guardProjectsUpdate(app, actor(['staff'], 'anna@example.invalid'), row, stopPayload).ok).toBe(true)
    expect(closed[kit.time!.minutes]).toBe(45)
  })

  it('marks comments internal with optional reply and restricts edit or delete to the author', () => {
    const { app, kit } = installed()
    const anna = actor(['staff'], 'anna@example.invalid')
    const values = commentWrite(kit.comment, {
      text: 'Ответ', taskId: 'task', projectId: 'project', at: '2026-11-18T08:00:00.000Z',
      author: 'Анна', authorEmail: 'anna@example.invalid', assigneeEmail: 'anna@example.invalid',
      mentionIds: [], replyToId: 'parent', internal: true,
    })
    expect(values[kit.comment.replyTo!]).toEqual(['parent'])
    expect(values[kit.comment.internal!]).toBe(true)
    expect(guardProjectsCreate(app, anna, kit.commentsTableId, values).ok).toBe(true)
    expect(guardProjectsCreate(app, actor(['client'], 'client@example.invalid'), kit.commentsTableId, values).ok).toBe(false)
    const row: AppV2Record = { id: 'comment', tableId: kit.commentsTableId, values }
    const edit = { [kit.comment.text]: 'Правка', ...(kit.comment.editedAt ? { [kit.comment.editedAt]: '2026-11-18T09:00:00.000Z' } : {}) }
    expect(guardProjectsUpdate(app, anna, row, edit).ok).toBe(true)
    expect(guardProjectsUpdate(app, actor(['staff'], 'igor@example.invalid'), row, edit).ok).toBe(false)
    expect(guardProjectsDelete(app, anna, row).ok).toBe(true)
    expect(guardProjectsDelete(app, actor(['staff'], 'igor@example.invalid'), row).ok).toBe(false)
  })

  it('lets the lead store templates and client share links', () => {
    const { app, kit } = installed()
    const owner = actor(['owner'], 'owner@example.invalid')
    const template = templateWrite(kit.template!, {
      name: 'Сайт', payload: serializeTemplatePayload({ version: 1, stages: [], tasks: [] }),
      createdAt: '2026-11-18T08:00:00.000Z', author: 'Руководитель',
    })
    expect(guardProjectsCreate(app, owner, kit.templatesTableId!, template).ok).toBe(true)
    expect(guardProjectsCreate(app, actor(['staff'], 'anna@example.invalid'), kit.templatesTableId!, template).ok).toBe(false)
    const share = shareWrite(kit.share!, { token: 'a'.repeat(36), projectId: 'project', label: 'Клиент', createdAt: '2026-11-18T08:00:00.000Z' })
    expect(guardProjectsCreate(app, owner, kit.sharesTableId!, share).ok).toBe(true)
    expect(guardProjectsCreate(app, actor(['client'], 'client@example.invalid'), kit.sharesTableId!, share).ok).toBe(false)
  })
})
