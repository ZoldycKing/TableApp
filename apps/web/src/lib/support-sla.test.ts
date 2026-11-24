import { describe, expect, it } from 'vitest'
import { SUPPORT_SLA_STARTER, supportDashboard, supportQueueMatch, supportSlaView, type SupportSlaEvent, type SupportSlaPolicy } from './support-sla'

const policy: SupportSlaPolicy = SUPPORT_SLA_STARTER
const t0 = Date.parse('2026-11-23T09:00:00.000Z')
const min = (n: number) => n * 60_000

function created(at = t0, priority = 'Срочный', status = 'Новое'): SupportSlaEvent {
  return { at, kind: 'created', priority, status }
}

describe('support SLA clocks', () => {
  it('does not invent a clock when the ticket has no events or no policy', () => {
    expect(supportSlaView([], policy, t0).known).toBe(false)
    expect(supportSlaView([created()], null, t0).known).toBe(false)
  })

  it('breaches first response only after the budget and ignores an internal note', () => {
    const events = [created()]
    expect(supportSlaView(events, policy, t0 + min(59)).currentOverdue).toBe(false)
    expect(supportSlaView(events, policy, t0 + min(59)).currentRisk).toBe(true)
    const due = supportSlaView(events, policy, t0 + min(60))
    expect(due.currentOverdue).toBe(true)
    expect(due.first.overdue).toBe(true)
    expect(due.resolution.overdue).toBe(false)
  })

  it('counts only a public operator reply as the first response', () => {
    const events = [created(), { at: t0 + min(30), kind: 'public_reply' as const }]
    const view = supportSlaView(events, policy, t0 + min(90))
    expect(view.first.met).toBe(true)
    expect(view.first.overdue).toBe(false)
    expect(view.currentOverdue).toBe(false)
    expect(view.firstCloses).toEqual([{ at: t0 + min(30), met: true, spentMs: min(30) }])
  })

  it('pauses while waiting for the client and keeps the remainder', () => {
    const events: SupportSlaEvent[] = [
      created(),
      { at: t0 + min(20), kind: 'status', status: 'Ждём клиента' },
    ]
    const paused = supportSlaView(events, policy, t0 + min(500))
    expect(paused.paused).toBe(true)
    expect(paused.currentOverdue).toBe(false)
    expect(paused.currentRisk).toBe(false)
    const resumed = supportSlaView([...events, { at: t0 + min(500), kind: 'status', status: 'В работе' }], policy, t0 + min(530))
    expect(resumed.paused).toBe(false)
    expect(resumed.currentOverdue).toBe(false)
    expect(resumed.first.remainingMs).toBe(min(10))
  })

  it('restarts open clocks on priority change and keeps the earlier breach', () => {
    const events: SupportSlaEvent[] = [
      created(t0, 'Обычный'),
      { at: t0 + min(500), kind: 'priority', priority: 'Срочный' },
    ]
    const view = supportSlaView(events, policy, t0 + min(500))
    expect(view.breaches.map(breach => breach.kind)).toEqual(['first'])
    expect(view.currentOverdue).toBe(false)
    expect(view.priority).toBe('urgent')
    expect(view.first.remainingMs).toBe(min(60))
  })

  it('stops on resolve, keeps the miss, and starts a new cycle on reopen', () => {
    const events: SupportSlaEvent[] = [
      created(),
      { at: t0 + min(90), kind: 'status', status: 'Решено' },
      { at: t0 + min(200), kind: 'status', status: 'В работе' },
    ]
    const view = supportSlaView(events, policy, t0 + min(210))
    expect(view.breaches.some(breach => breach.kind === 'first' && breach.at === t0 + min(90))).toBe(true)
    expect(view.open).toBe(true)
    expect(view.currentOverdue).toBe(false)
    expect(view.first.remainingMs).toBe(min(50))
    expect(view.resolutionCloses).toHaveLength(1)
    expect(view.resolutionCloses[0]?.met).toBe(true)
  })

  it('does not let a second public reply or a paused resolved ticket double-count', () => {
    const events: SupportSlaEvent[] = [
      created(),
      { at: t0 + min(10), kind: 'public_reply' },
      { at: t0 + min(20), kind: 'public_reply' },
      { at: t0 + min(30), kind: 'status', status: 'Ждём клиента' },
    ]
    const view = supportSlaView(events, policy, t0 + min(1000))
    expect(view.firstCloses).toHaveLength(1)
    expect(view.currentOverdue).toBe(false)
    const dash = supportDashboard([
      { assigneeEmail: '', sla: view },
      { assigneeEmail: 'a@podderzhka-demo.ru', sla: view },
    ], t0 + min(1000), min(60 * 24))
    expect(dash.overdue).toBe(0)
    expect(dash.risk).toBe(0)
    expect(dash.firstClosed).toBe(2)
    expect(dash.firstMet).toBe(2)
    expect(dash.avgFirstResponseMs).toBe(min(10))
  })

  it('includes a late public reply in the average and not in the met share', () => {
    const events: SupportSlaEvent[] = [created(), { at: t0 + min(90), kind: 'public_reply' }]
    const view = supportSlaView(events, policy, t0 + min(90))
    const dash = supportDashboard([{ assigneeEmail: 'a@podderzhka-demo.ru', sla: view }], t0 + min(90), min(60 * 24))
    expect(view.first.met).toBe(false)
    expect(dash.firstClosed).toBe(1)
    expect(dash.firstMet).toBe(0)
    expect(dash.avgFirstResponseMs).toBe(min(90))
    expect(dash.overdue).toBe(0)
    const outside = supportDashboard([{ assigneeEmail: 'a@podderzhka-demo.ru', sla: view }], t0 + min(90) + min(60 * 24) + 1, min(60))
    expect(outside.avgFirstResponseMs).toBeNull()
    expect(outside.firstClosed).toBe(0)
  })

  it('matches queues once when both clocks are late and excludes pause and closed work', () => {
    const late = supportSlaView([created()], policy, t0 + min(300))
    expect(late.first.overdue && late.resolution.overdue).toBe(true)
    expect(supportQueueMatch({ status: 'Новое', assigneeEmail: '', sla: late, manualOverdue: false }, 'overdue', '')).toBe(true)
    expect(supportQueueMatch({ status: 'Новое', assigneeEmail: '', sla: late, manualOverdue: false }, 'unassigned', '')).toBe(true)
    const paused = supportSlaView([created(), { at: t0 + min(10), kind: 'status', status: 'Ждём клиента' }], policy, t0 + min(300))
    expect(supportQueueMatch({ status: 'Ждём клиента', assigneeEmail: 'a@podderzhka-demo.ru', sla: paused, manualOverdue: true }, 'overdue', '')).toBe(false)
    expect(supportQueueMatch({ status: 'Ждём клиента', assigneeEmail: 'a@podderzhka-demo.ru', sla: paused, manualOverdue: true }, 'risk', '')).toBe(false)
    const closed = supportSlaView([created(), { at: t0 + min(10), kind: 'status', status: 'Закрыто' }], policy, t0 + min(300))
    expect(supportQueueMatch({ status: 'Закрыто', assigneeEmail: '', sla: closed, manualOverdue: true }, 'overdue', '')).toBe(false)
    expect(supportQueueMatch({ status: 'Закрыто', assigneeEmail: '', sla: closed, manualOverdue: true }, 'open', '')).toBe(false)
  })
})
