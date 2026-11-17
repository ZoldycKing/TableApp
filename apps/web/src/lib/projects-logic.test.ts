import { describe, expect, it } from 'vitest'
import { canParent, eventText, formatDay, insertMention, isOverdue, matchesDue, mentionQuery, mentionedNames, progressPercent, reorderColumn, sortsFor, subtaskProgress, taskBucket } from './projects-logic'

const now = Date.parse('2026-11-17T07:00:00.000Z')
const task = (due: string, status = 'В работе') => ({ status, due })

describe('project task groups', () => {
  it('puts open work into today, overdue, this week and later, and drops finished tasks', () => {
    expect(taskBucket(task('2026-11-17'), now)).toBe('today')
    expect(taskBucket(task('2026-11-16'), now)).toBe('overdue')
    expect(taskBucket(task('2026-11-18'), now)).toBe('week')
    expect(taskBucket(task('2026-11-22'), now)).toBe('week')
    expect(taskBucket(task('2026-11-23'), now)).toBe('later')
    expect(taskBucket(task('2026-11-16', 'Готово'), now)).toBeNull()
    expect(isOverdue(task('2026-11-16'), now)).toBe(true)
    expect(isOverdue(task('2026-11-16', 'Готово'), now)).toBe(false)
    expect(isOverdue(task('2026-11-17'), now)).toBe(false)
  })

  it('keeps a finished task in the calendar filter without calling it overdue', () => {
    expect(matchesDue(task('2026-11-16', 'Готово'), 'overdue', now)).toBe(false)
    expect(matchesDue(task('2026-11-17', 'Готово'), 'today', now)).toBe(true)
    expect(matchesDue(task('2026-11-20'), 'week', now)).toBe(true)
  })

  it('counts closed tasks and formats the day', () => {
    expect(progressPercent(['Готово', 'В работе', 'К работе', 'Готово'])).toBe(50)
    expect(progressPercent([])).toBe(0)
    expect(formatDay('2026-11-12')).toBe('12.11.2026')
    expect(eventText('status', 'Макет', 'К работе', 'В работе')).toBe('Статус задачи «Макет»: К работе → В работе')
  })

  it('finds a mention being typed and refuses a nested subtask', () => {
    expect(mentionQuery('Макет @Иг', 9)).toEqual({ start: 6, query: 'Иг' })
    expect(mentionQuery('готово', 6)).toBeNull()
    expect(insertMention('Макет @Иг', 6, 9, 'Игорь Белов')).toBe('Макет @Игорь Белов ')
    expect(mentionedNames('смотри @Игорь Белов', ['Игорь Белов', 'Анна Волкова'])).toEqual(['Игорь Белов'])
    expect(canParent('parent', [{ id: 'parent', parentId: '' }, { id: 'child', parentId: 'parent' }])).toBe(true)
    expect(canParent('child', [{ id: 'parent', parentId: '' }, { id: 'child', parentId: 'parent' }])).toBe(false)
    expect(subtaskProgress(['Готово', 'В работе', 'К работе'])).toEqual({ done: 1, total: 3 })
  })

  it('reorders a card inside a column and across columns', () => {
    expect(reorderColumn(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c'])
    expect(reorderColumn(['a', 'b'], 'c', null)).toEqual(['a', 'b', 'c'])
    expect(sortsFor(['a', 'b'])).toEqual([{ id: 'a', sort: 10 }, { id: 'b', sort: 20 }])
  })
})
