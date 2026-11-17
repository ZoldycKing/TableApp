import { calendarDay, dateInstant, instantToWallClock } from '@tableapp/schema'

/** Field-service rules shared by the dispatcher board, the technician app and tests. */
export const DISPATCH_TIME_ZONE = 'Europe/Moscow'

export const DONE_STATUS_NAMES = ['Выполнено', 'Готово'] as const
export const CANCELLED_STATUS_NAMES = ['Отменена', 'Отменено', 'Отменён'] as const
export const IN_PROGRESS_STATUS_NAMES = ['Выехал', 'На месте', 'В работе'] as const
export const PRIORITY_RANK: Record<string, number> = { Срочный: 0, Высокий: 1, Обычный: 2, Низкий: 3 }

export type DispatchCounter = 'overdue' | 'today' | 'unassigned' | 'inProgress'
export type TechnicianGroup = 'overdue' | 'today' | 'later'

export type DispatchJobFacts = {
  id: string
  status: string
  priority: string
  when: unknown
  technicianId: string | null
  masterEmail: string
}

export type DispatchCounters = Record<DispatchCounter, number>

const done = (status: string) => (DONE_STATUS_NAMES as readonly string[]).includes(status)
const cancelled = (status: string) => (CANCELLED_STATUS_NAMES as readonly string[]).includes(status)
const inProgress = (status: string) => (IN_PROGRESS_STATUS_NAMES as readonly string[]).includes(status)

export function technicianIdOf(value: unknown): string | null {
  if (Array.isArray(value)) {
    const id = value.find((item): item is string => typeof item === 'string' && item.length > 0)
    return id ?? null
  }
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function isTechnicianActive(statusName: string) {
  return statusName === 'Активен'
}

/** A date-only value is overdue after that civil day; a timestamp is overdue once that minute has passed. */
export function scheduledDeadline(value: unknown, timeZone = DISPATCH_TIME_ZONE): number | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return dateInstant(`${value}T23:59`, timeZone)
  return dateInstant(value, timeZone)
}

export function isOverdue(job: Pick<DispatchJobFacts, 'status' | 'when'>, now: number, timeZone = DISPATCH_TIME_ZONE) {
  if (done(job.status) || cancelled(job.status)) return false
  const deadline = scheduledDeadline(job.when, timeZone)
  return deadline !== null && deadline < now
}

export function isUnassigned(job: Pick<DispatchJobFacts, 'technicianId' | 'masterEmail'>) {
  return !job.technicianId && job.masterEmail.trim() === ''
}

export function isToday(job: Pick<DispatchJobFacts, 'when' | 'status'>, now: number, timeZone = DISPATCH_TIME_ZONE) {
  if (cancelled(job.status)) return false
  const day = calendarDay(job.when, timeZone)
  const today = instantToWallClock(new Date(now), timeZone)?.date
  return Boolean(day && today && day === today)
}

export function dispatchCounters(jobs: readonly DispatchJobFacts[], now: number, timeZone = DISPATCH_TIME_ZONE): DispatchCounters {
  return {
    overdue: jobs.filter(job => isOverdue(job, now, timeZone)).length,
    today: jobs.filter(job => isToday(job, now, timeZone)).length,
    unassigned: jobs.filter(job => isUnassigned(job) && !done(job.status) && !cancelled(job.status)).length,
    inProgress: jobs.filter(job => inProgress(job.status) && !cancelled(job.status)).length,
  }
}

export function matchesCounter(job: DispatchJobFacts, counter: DispatchCounter, now: number, timeZone = DISPATCH_TIME_ZONE) {
  if (counter === 'overdue') return isOverdue(job, now, timeZone)
  if (counter === 'today') return isToday(job, now, timeZone)
  if (counter === 'unassigned') return isUnassigned(job) && !done(job.status) && !cancelled(job.status)
  return inProgress(job.status) && !cancelled(job.status)
}

/** Mutually exclusive buckets. Overdue wins over today; finished and cancelled jobs leave the working list. */
export function technicianGroup(job: DispatchJobFacts, now: number, timeZone = DISPATCH_TIME_ZONE): TechnicianGroup | null {
  if (cancelled(job.status)) return null
  if (isOverdue(job, now, timeZone)) return 'overdue'
  if (isToday(job, now, timeZone)) return 'today'
  if (done(job.status)) return null
  const day = calendarDay(job.when, timeZone)
  const today = instantToWallClock(new Date(now), timeZone)?.date
  if (!day || (today && day > today)) return 'later'
  return null
}

export function priorityRank(priority: string) {
  return PRIORITY_RANK[priority] ?? 9
}

export function sortJobs(jobs: readonly DispatchJobFacts[], by: 'when' | 'priority', timeZone = DISPATCH_TIME_ZONE) {
  const instant = (job: DispatchJobFacts) => scheduledDeadline(job.when, timeZone) ?? Number.MAX_SAFE_INTEGER
  return [...jobs].sort((a, b) => {
    const primary = by === 'priority' ? priorityRank(a.priority) - priorityRank(b.priority) : instant(a) - instant(b)
    if (primary !== 0) return primary
    const secondary = by === 'priority' ? instant(a) - instant(b) : priorityRank(a.priority) - priorityRank(b.priority)
    return secondary || a.id.localeCompare(b.id)
  })
}

export function activeTechnicians<T extends { active: boolean }>(technicians: readonly T[]) {
  return technicians.filter(technician => technician.active)
}

/** Keep a calendar column when activity is unknown; hide a technician who is explicitly inactive. */
export function keepCalendarResource(activeValue: unknown, activeChoiceId: string, known: boolean) {
  if (!known) return true
  return activeValue === activeChoiceId
}

export type AssignmentTechnician = { id: string; name: string; email: string; active: boolean }

export function assignmentPatch(input: {
  technician: AssignmentTechnician
  whenIso: string
  currentStatus: string
  freshStatus: string
  assignedStatus: string
  technicianField: string
  nameField: string
  emailField: string
  whenField: string
  dateField: string
  statusField: string
}): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  if (!input.technician.active) return { ok: false, error: 'Этот мастер неактивен и не назначается на выезды.' }
  if (!input.technician.email.trim()) return { ok: false, error: 'У мастера не указана почта для доступа к заявке.' }
  const when = dateInstant(input.whenIso, DISPATCH_TIME_ZONE)
  if (when === null) return { ok: false, error: 'Выберите дату и время выезда.' }
  const iso = new Date(when).toISOString()
  return {
    ok: true,
    patch: {
      [input.technicianField]: [input.technician.id],
      [input.nameField]: input.technician.name,
      [input.emailField]: input.technician.email.trim().toLowerCase(),
      [input.whenField]: iso,
      [input.dateField]: iso,
      ...(input.currentStatus === input.freshStatus ? { [input.statusField]: input.assignedStatus } : {}),
    },
  }
}

export function reassignedNotes<T extends { jobId: string; masterEmail: string }>(notes: readonly T[], jobId: string, email: string) {
  const normalized = email.trim().toLowerCase()
  return notes.map(note => note.jobId === jobId ? { ...note, masterEmail: normalized } : note)
}

export type CompletionPhoto = { url: string; name: string }

export function completionPatch(input: {
  report: string
  photos: readonly CompletionPhoto[]
  signature: string | null
  doneStatus: string
  statusField: string
  reportField: string
  photoField: string
  signatureField: string
}): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const report = input.report.trim()
  if (!report) return { ok: false, error: 'Опишите, что сделано.' }
  const signature = input.signature?.trim() ?? ''
  if (!signature) return { ok: false, error: 'Нужна подпись клиента.' }
  return {
    ok: true,
    patch: {
      [input.statusField]: input.doneStatus,
      [input.reportField]: report,
      [input.photoField]: input.photos.map(photo => ({ url: photo.url, name: photo.name, mime: 'image/jpeg' })),
      [input.signatureField]: [{ url: signature, name: 'Подпись клиента.png', mime: 'image/png' }],
    },
  }
}

export function readCompletion(values: Record<string, unknown>, fields: { report: string; photo: string; signature: string; status: string }) {
  return {
    status: values[fields.status] ?? null,
    report: typeof values[fields.report] === 'string' ? values[fields.report] : '',
    photos: values[fields.photo] ?? [],
    signature: values[fields.signature] ?? [],
  }
}

export function noteDraft(input: { text: string; author: string; authorEmail: string; at: string; jobId: string; masterEmail: string }) {
  const text = input.text.trim()
  if (!text) return { ok: false as const, error: 'Напишите заметку.' }
  return {
    ok: true as const,
    values: {
      text,
      author: input.author.trim() || 'Сотрудник',
      authorEmail: input.authorEmail.trim().toLowerCase(),
      at: input.at,
      jobId: input.jobId,
      masterEmail: input.masterEmail.trim().toLowerCase(),
    },
  }
}
