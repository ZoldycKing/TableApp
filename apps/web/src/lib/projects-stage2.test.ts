import { describe, expect, it } from 'vitest'
import {
  activeTimerFor, canLinkTasks, canStartTimer, captureProjectTemplate, entryMinutes, filterClientComments,
  formatMinutes, formatSpentPair, ganttArrowPath, ganttBars, ganttRange, materializeTemplate, matchesRoleFilter,
  moveBarDates, nextOccurrenceDay, projectSpentMinutes, recurrenceLabel, resizeBarDates, shouldSpawnOnComplete,
  stopTimerValues, totalSpentMinutes, validateManualMinutes, workloadFor,
} from './projects-stage2'

describe('project dependencies', () => {
  it('allows finish-to-start links and rejects cycles', () => {
    expect(canLinkTasks([], 'a', 'b')).toEqual({ ok: true })
    expect(canLinkTasks([{ id: '1', fromId: 'a', toId: 'b' }], 'b', 'c')).toEqual({ ok: true })
    expect(canLinkTasks([{ id: '1', fromId: 'a', toId: 'b' }, { id: '2', fromId: 'b', toId: 'c' }], 'c', 'a').ok).toBe(false)
    expect(canLinkTasks([], 'a', 'a').ok).toBe(false)
    expect(canLinkTasks([{ id: '1', fromId: 'a', toId: 'b' }], 'a', 'b').ok).toBe(false)
  })
})

describe('gantt bars', () => {
  it('builds bars from start and due and moves or resizes them by days', () => {
    const tasks = [
      { id: 't1', title: 'Макет', start: '2026-11-10', due: '2026-11-12', status: 'В работе', parentId: '' },
      { id: 't2', title: 'Без дат', start: null, due: null, status: 'К работе', parentId: '' },
      { id: 't3', title: 'ISO', start: '2026-11-11T07:00:00.000Z', due: '2026-11-13T07:00:00.000Z', status: 'К работе', parentId: '' },
    ]
    const range = ganttRange(tasks, '2026-11-17', 0)
    expect(range.start).toBe('2026-11-10')
    expect(range.end).toBe('2026-11-13')
    const bars = ganttBars(tasks, '2026-11-10')
    expect(bars).toHaveLength(2)
    expect(bars[0]).toMatchObject({ id: 't1', dayOffset: 0, daySpan: 3, done: false })
    expect(bars.find(bar => bar.id === 't3')).toMatchObject({ dayOffset: 1, daySpan: 3 })
    expect(moveBarDates('2026-11-10', '2026-11-12', 2)).toEqual({ start: '2026-11-12', end: '2026-11-14' })
    expect(resizeBarDates('2026-11-10', '2026-11-12', 'end', 1)).toEqual({ start: '2026-11-10', end: '2026-11-13' })
    expect(resizeBarDates('2026-11-10', '2026-11-12', 'start', 5)).toEqual({ start: '2026-11-12', end: '2026-11-12' })
    expect(ganttArrowPath({ x: 10, y: 10 }, { x: 80, y: 50 })).toContain(' V ')
    expect(ganttArrowPath({ x: 100, y: 10 }, { x: 40, y: 50 }, 56, 130)).toContain('H 130')
    expect(formatSpentPair(330, 360)).toBe('5 ч 30 мин / 6 ч')
    expect(formatSpentPair(0, 180)).toBe('0 мин / 3 ч')
    expect(formatSpentPair(0, null)).toBe('0 мин')
  })
})

describe('time tracking totals', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z')
  it('sums closed and running entries and keeps one active timer per user', () => {
    const entries = [
      { id: '1', taskId: 't1', email: 'anna@example.invalid', startedAt: '2026-11-18T10:00:00.000Z', endedAt: '2026-11-18T11:00:00.000Z', minutes: 60, note: '' },
      { id: '2', taskId: 't1', email: 'anna@example.invalid', startedAt: '2026-11-18T11:30:00.000Z', endedAt: null, minutes: null, note: '' },
      { id: '3', taskId: 't2', email: 'igor@example.invalid', startedAt: '2026-11-18T09:00:00.000Z', endedAt: '2026-11-18T09:45:00.000Z', minutes: 45, note: '' },
    ]
    expect(entryMinutes(entries[1]!, now)).toBe(30)
    expect(totalSpentMinutes(entries, 't1', now)).toBe(90)
    expect(projectSpentMinutes(entries, ['t1', 't2'], now)).toBe(135)
    expect(formatMinutes(90)).toBe('1 ч 30 мин')
    expect(activeTimerFor(entries, 'anna@example.invalid')?.id).toBe('2')
    expect(canStartTimer(entries, 'anna@example.invalid', 't2').ok).toBe(false)
    expect(canStartTimer(entries, 'marina@example.invalid', 't1')).toEqual({ ok: true })
    expect(stopTimerValues('2026-11-18T11:30:00.000Z', now)).toEqual({ endedAt: '2026-11-18T12:00:00.000Z', minutes: 30 })
    expect(validateManualMinutes(25)).toEqual({ ok: true, minutes: 25 })
    expect(validateManualMinutes(0).ok).toBe(false)
  })
})

describe('recurrence', () => {
  it('computes the next instance and labels the rule', () => {
    expect(nextOccurrenceDay({ due: '2026-11-18', rule: 'daily' })).toBe('2026-11-19')
    expect(nextOccurrenceDay({ due: '2026-11-18', rule: 'weekly' })).toBe('2026-11-25')
    expect(nextOccurrenceDay({ due: '2026-01-31', rule: 'monthly' })).toBe('2026-02-28')
    expect(nextOccurrenceDay({ due: '2026-11-18', rule: 'custom', everyDays: 3 })).toBe('2026-11-21')
    expect(shouldSpawnOnComplete('В работе', 'Готово', 'weekly')).toBe(true)
    expect(shouldSpawnOnComplete('Готово', 'Готово', 'weekly')).toBe(false)
    expect(recurrenceLabel('custom', 5)).toBe('Каждые 5 дн.')
    expect(recurrenceLabel('weekly')).toBe('Еженедельно')
  })
})

describe('project templates', () => {
  it('stores relative offsets and recreates dates from a start day', () => {
    const payload = captureProjectTemplate({
      anchor: '2026-11-01',
      stages: [{ id: 's1', title: 'Макет', goal: 'Согласовать', start: '2026-11-01', end: '2026-11-10' }],
      tasks: [{
        id: 't1', title: 'Структура', description: 'Разделы', checklist: '[]', priority: 'Высокий',
        stageId: 's1', parentId: '', start: '2026-11-02', due: '2026-11-05', estimate: 120, assigneeRole: 'Исполнитель',
      }, {
        id: 't2', title: 'Подзадача', description: '', checklist: '[]', priority: 'Средний',
        stageId: 's1', parentId: 't1', start: '2026-11-03', due: '2026-11-04', estimate: 60, assigneeRole: 'Исполнитель',
      }],
    })
    expect(payload.stages[0]?.startOffset).toBe(0)
    expect(payload.tasks[0]?.dueOffset).toBe(4)
    expect(payload.tasks[1]?.parentKey).toBe('task_1')
    const made = materializeTemplate(payload, '2026-12-01')
    expect(made.ok).toBe(true)
    if (!made.ok) return
    expect(made.stages[0]?.start).toBe('2026-12-01')
    expect(made.tasks[0]?.due).toBe('2026-12-05')
    expect(made.tasks[1]?.parentKey).toBe('task_1')
  })
})

describe('workload and access', () => {
  it('highlights overload and filters author or observer roles', () => {
    const people = [{ id: 'p1', name: 'Анна', email: 'anna@example.invalid' }]
    const tasks = [
      { id: 't1', assigneeId: 'p1', due: '2026-11-18', estimate: 300, status: 'В работе' },
      { id: 't2', assigneeId: 'p1', due: '2026-11-18', estimate: 240, status: 'К работе' },
    ]
    const rows = workloadFor({ people, tasks, entries: [], days: ['2026-11-18'], mode: 'day', now: Date.parse('2026-11-18T12:00:00.000Z') })
    expect(rows[0]?.cells[0]?.minutes).toBe(540)
    expect(rows[0]?.overloaded).toBe(true)
    expect(matchesRoleFilter({ filter: 'author', email: 'marina@example.invalid', assigneeEmail: 'anna@example.invalid', authorEmail: 'marina@example.invalid', observerEmails: [] })).toBe(true)
    expect(matchesRoleFilter({ filter: 'observer', email: 'igor@example.invalid', assigneeEmail: 'anna@example.invalid', authorEmail: 'marina@example.invalid', observerEmails: ['igor@example.invalid'] })).toBe(true)
    expect(matchesRoleFilter({ filter: 'observer', email: 'anna@example.invalid', assigneeEmail: 'anna@example.invalid', authorEmail: 'marina@example.invalid', observerEmails: [] })).toBe(false)
    expect(filterClientComments([{ internal: true }, { internal: false }, {}])).toHaveLength(2)
  })
})
