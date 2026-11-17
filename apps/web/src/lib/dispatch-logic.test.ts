import { describe, expect, it } from 'vitest'
import {
  activeTechnicians, assignmentPatch, completionPatch, dispatchCounters, isOverdue, keepCalendarResource,
  matchesCounter, noteDraft, readCompletion, reassignedNotes, sortJobs, technicianGroup, type DispatchJobFacts,
} from './dispatch-logic'

const now = Date.parse('2026-11-17T09:00:00.000Z')
const job = (patch: Partial<DispatchJobFacts> & Pick<DispatchJobFacts, 'id' | 'status' | 'when'>): DispatchJobFacts => ({
  priority: 'Обычный', technicianId: 'tech', masterEmail: 'sergey@example.invalid', ...patch,
})

describe('field service overdue, counters and groups', () => {
  const jobs: DispatchJobFacts[] = [
    job({ id: 'yesterday', status: 'Выехал', when: '2026-11-16T07:00:00.000Z', priority: 'Высокий' }),
    job({ id: 'tonight', status: 'Назначена', when: '2026-11-17T15:00:00.000Z' }),
    job({ id: 'morning', status: 'На месте', when: '2026-11-17T06:00:00.000Z', priority: 'Срочный' }),
    job({ id: 'free', status: 'Новая', when: '2026-11-18T07:00:00.000Z', technicianId: null, masterEmail: '' }),
    job({ id: 'done', status: 'Выполнено', when: '2026-11-16T07:00:00.000Z' }),
    job({ id: 'cancelled', status: 'Отменена', when: '2026-11-16T07:00:00.000Z', technicianId: null, masterEmail: '' }),
    job({ id: 'date-only', status: 'Новая', when: '2026-11-17', technicianId: 'tech', masterEmail: 'a@example.invalid' }),
  ]
  it('marks a passed visit overdue until it is done or cancelled, and waits until the end of a date-only day', () => {
    expect(isOverdue(jobs[0]!, now)).toBe(true)
    expect(isOverdue(jobs[1]!, now)).toBe(false)
    expect(isOverdue(jobs[2]!, now)).toBe(true)
    expect(isOverdue(jobs[4]!, now)).toBe(false)
    expect(isOverdue(jobs[5]!, now)).toBe(false)
    expect(isOverdue(jobs[6]!, now)).toBe(false)
    expect(isOverdue(jobs[6]!, Date.parse('2026-11-17T21:00:00.000Z'))).toBe(true)
  })
  it('counts overdue, today, unassigned and in-progress jobs, and each counter filters the list', () => {
    expect(dispatchCounters(jobs, now)).toEqual({ overdue: 2, today: 3, unassigned: 1, inProgress: 2 })
    expect(jobs.filter(item => matchesCounter(item, 'overdue', now)).map(item => item.id)).toEqual(['yesterday', 'morning'])
    expect(jobs.filter(item => matchesCounter(item, 'unassigned', now)).map(item => item.id)).toEqual(['free'])
    expect(jobs.filter(item => matchesCounter(item, 'today', now)).map(item => item.id)).toEqual(['tonight', 'morning', 'date-only'])
    expect(jobs.filter(item => matchesCounter(item, 'inProgress', now)).map(item => item.id)).toEqual(['yesterday', 'morning'])
  })
  it('groups a technician list into overdue, today and later without duplicating a job', () => {
    expect(technicianGroup(jobs[0]!, now)).toBe('overdue')
    expect(technicianGroup(jobs[2]!, now)).toBe('overdue')
    expect(technicianGroup(jobs[1]!, now)).toBe('today')
    expect(technicianGroup(jobs[3]!, now)).toBe('later')
    expect(technicianGroup(jobs[4]!, now)).toBeNull()
    expect(technicianGroup(jobs[5]!, now)).toBeNull()
    expect(sortJobs(jobs, 'priority').map(item => item.id)[0]).toBe('morning')
  })
})

describe('assignment, inactive technicians and the completion report', () => {
  const fields = { technicianField: 'technician', nameField: 'name', emailField: 'email', whenField: 'when', dateField: 'date', statusField: 'status' }
  it('refuses an inactive technician and writes the active technician, time and mail', () => {
    const inactive = assignmentPatch({ technician: { id: 'pavel', name: 'Павел', email: 'pavel@example.invalid', active: false }, whenIso: '2026-11-17T12:00:00.000Z', currentStatus: 'Новая', freshStatus: 'Новая', assignedStatus: 'assigned', ...fields })
    expect(inactive).toEqual({ ok: false, error: 'Этот мастер неактивен и не назначается на выезды.' })
    expect(activeTechnicians([{ id: 'pavel', active: false }, { id: 'sergey', active: true }])).toEqual([{ id: 'sergey', active: true }])
    expect(keepCalendarResource('inactive', 'active', true)).toBe(false)
    expect(keepCalendarResource(undefined, 'active', false)).toBe(true)
    const assigned = assignmentPatch({ technician: { id: 'sergey', name: 'Сергей Волков', email: ' Sergey@Example.Invalid ', active: true }, whenIso: '2026-11-17T12:00:00.000Z', currentStatus: 'Новая', freshStatus: 'Новая', assignedStatus: 'assigned', ...fields })
    expect(assigned.ok).toBe(true)
    if (!assigned.ok) return
    expect(assigned.patch).toMatchObject({ technician: ['sergey'], name: 'Сергей Волков', email: 'sergey@example.invalid', status: 'assigned' })
    expect(assigned.patch.when).toBe(assigned.patch.date)
    const notes = reassignedNotes([
      { id: 'n1', jobId: 'job', masterEmail: '' },
      { id: 'n2', jobId: 'other', masterEmail: 'old@example.invalid' },
    ], 'job', 'sergey@example.invalid')
    expect(notes.map(note => note.masterEmail)).toEqual(['sergey@example.invalid', 'old@example.invalid'])
  })
  it('stores the work report, photos and client signature and reads them back', () => {
    const signature = 'data:image/png;base64,iVBORw0KGgo='
    const saved = completionPatch({
      report: '  Заменили насос и проверили давление. ',
      photos: [{ url: 'data:image/jpeg;base64,aaa', name: 'насос.jpg' }],
      signature, doneStatus: 'done', statusField: 'status', reportField: 'report', photoField: 'photo', signatureField: 'signature',
    })
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    const stored = { id: 'job', ...saved.patch }
    expect(readCompletion(stored, { report: 'report', photo: 'photo', signature: 'signature', status: 'status' })).toEqual({
      status: 'done',
      report: 'Заменили насос и проверили давление.',
      photos: [{ url: 'data:image/jpeg;base64,aaa', name: 'насос.jpg', mime: 'image/jpeg' }],
      signature: [{ url: signature, name: 'Подпись клиента.png', mime: 'image/png' }],
    })
    expect(completionPatch({ report: '   ', photos: [], signature, doneStatus: 'done', statusField: 'status', reportField: 'report', photoField: 'photo', signatureField: 'signature' }).ok).toBe(false)
    expect(completionPatch({ report: 'Сделано', photos: [], signature: '  ', doneStatus: 'done', statusField: 'status', reportField: 'report', photoField: 'photo', signatureField: 'signature' }).ok).toBe(false)
    expect(noteDraft({ text: '  Позвонить за 20 минут ', author: 'Диспетчер', authorEmail: 'dispatcher@example.invalid', at: '2026-11-17T08:00:00.000Z', jobId: 'job', masterEmail: 'sergey@example.invalid' }).ok).toBe(true)
  })
})
