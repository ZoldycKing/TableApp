'use client'
import { useEffect, useId, useState } from 'react'
import type { AppV2, AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import {
  activeTimerFor, captureProjectTemplate, canLinkTasks, canStartTimer, DAY_CAPACITY, eachDay, entryMinutes, formatClock,
  formatCommentWhen, formatMinutes, formatSpentPair, materializeTemplate, parseTemplatePayload, recurrenceLabel, repeatName, repeatRuleFromName,
  serializeTemplatePayload, shareToken, stagesWord, startTimerStamp, stopTimerValues, tasksWord, totalSpentMinutes, validateManualMinutes,
  WEEK_CAPACITY, workloadFor, type DependencyLink, type RepeatRule, type TimeEntry,
} from '@/lib/projects-stage2'
import { civilDay, formatDay, todayKey, weekEndKey } from '@/lib/projects-logic'
import { commentWrite, linkWrite, shareWrite, templateWrite, timeWrite } from '@/lib/projects-persist'
import { DateMenu } from './booking-calendar'
import { AppDialog } from './app-dialog'
import { BookingAvatar } from './booking-avatar'
import { DetailSection } from './layout-shell'
import { ProtoIcon } from '../prototype/icons'
import buttons from '../prototype/prototype.module.css'
import { ProjectsGantt } from './projects-gantt'
import css from './projects.module.css'

const textOf = (value: unknown) => Array.isArray(value) ? '' : value == null ? '' : String(value)
const firstId = (value: unknown) => Array.isArray(value) ? value.find((item): item is string => typeof item === 'string') ?? '' : ''
const idsOf = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

export type Stage2Helpers = {
  kit: NonNullable<AppV2['projects']>
  tables: readonly BuilderV2Table[]
  rows: AppV2Record[]
  of: (tableId: string) => AppV2Record[]
  replace?: (rows: AppV2Record[]) => void
  now: number
  leader: boolean
  actor: { email?: string | null; name?: string | null; roleIds: readonly string[] }
  onNavigate?: (screenId: string, recordId?: string) => void
  choiceName: (tableId: string, fieldId: string, value: unknown) => string
  choiceId: (tableId: string, fieldId: string, name: string) => string
  people: () => { id: string; name: string; email: string; photo?: AppV2Json; role: string; active: boolean }[]
  saveRemote?: (body: Record<string, unknown>) => Promise<boolean>
}

function timeEntries(helpers: Stage2Helpers): TimeEntry[] {
  const kit = helpers.kit
  if (!kit.timeTableId || !kit.time) return []
  return helpers.of(kit.timeTableId).map(row => ({
    id: row.id,
    taskId: firstId(row.values[kit.time!.task]),
    email: textOf(row.values[kit.time!.email]).trim().toLowerCase(),
    startedAt: textOf(row.values[kit.time!.startedAt]),
    endedAt: textOf(row.values[kit.time!.endedAt]) || null,
    minutes: typeof row.values[kit.time!.minutes] === 'number' ? Number(row.values[kit.time!.minutes]) : null,
    note: textOf(row.values[kit.time!.note]),
  }))
}

function dependencyLinks(helpers: Stage2Helpers, projectId?: string): DependencyLink[] {
  const kit = helpers.kit
  if (!kit.linksTableId || !kit.link) return []
  return helpers.of(kit.linksTableId).flatMap(row => {
    const project = firstId(row.values[kit.link!.project])
    if (projectId && project !== projectId) return []
    return [{ id: row.id, fromId: firstId(row.values[kit.link!.from]), toId: firstId(row.values[kit.link!.to]) }]
  })
}

export function TaskTimePanel(props: Stage2Helpers & { taskId: string; projectId: string; estimate: number | null; readOnly?: boolean }) {
  const email = (props.actor.email ?? '').trim().toLowerCase()
  const entries = timeEntries(props)
  const mine = entries.filter(entry => entry.taskId === props.taskId)
  const spent = totalSpentMinutes(entries, props.taskId, props.now)
  const active = activeTimerFor(entries, email)
  const runningHere = active?.taskId === props.taskId
  const [manual, setManual] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const person = props.people().find(item => item.email === email)

  const start = async () => {
    if (!props.kit.time || !props.kit.timeTableId || !person) { setError('Не найден сотрудник.'); return }
    const check = canStartTimer(entries, email, props.taskId)
    if (!check.ok) { setError(check.error); return }
    const values = timeWrite(props.kit.time, {
      taskId: props.taskId, projectId: props.projectId, personId: person.id, email,
      startedAt: startTimerStamp(props.now), endedAt: null, minutes: null, note: note.trim(),
    })
    if (props.replace) {
      props.replace([...props.rows, { id: `time_${crypto.randomUUID().replaceAll('-', '')}`, tableId: props.kit.timeTableId, values }])
      setNote(''); setError(''); return
    }
    await props.saveRemote?.({ kind: 'time-start', recordId: props.taskId, note: note.trim() })
  }

  const stop = async () => {
    if (!active || !props.kit.time || !props.kit.timeTableId) return
    const stopped = stopTimerValues(active.startedAt, props.now)
    if (props.replace) {
      props.replace(props.rows.map(row => row.id === active.id ? { ...row, values: { ...row.values, [props.kit.time!.endedAt]: stopped.endedAt, [props.kit.time!.minutes]: stopped.minutes } } : row))
      return
    }
    await props.saveRemote?.({ kind: 'time-stop', recordId: active.id })
  }

  const addManual = async () => {
    const minutes = Number(manual.replace(',', '.'))
    const check = validateManualMinutes(minutes)
    if (!check.ok) { setError(check.error); return }
    if (!props.kit.time || !props.kit.timeTableId || !person) { setError('Не найден сотрудник.'); return }
    const endedAt = new Date(props.now).toISOString()
    const startedAt = new Date(props.now - check.minutes * 60_000).toISOString()
    const values = timeWrite(props.kit.time, {
      taskId: props.taskId, projectId: props.projectId, personId: person.id, email,
      startedAt, endedAt, minutes: check.minutes, note: note.trim() || 'Ручная запись',
    })
    if (props.replace) {
      props.replace([...props.rows, { id: `time_${crypto.randomUUID().replaceAll('-', '')}`, tableId: props.kit.timeTableId, values }])
      setManual(''); setNote(''); setError(''); return
    }
    await props.saveRemote?.({ kind: 'time-manual', recordId: props.taskId, minutes: check.minutes, note: note.trim() })
  }

  return <DetailSection title="Время">
    <div className={css.timerRow} data-task-time>
      <strong>{formatSpentPair(spent, props.estimate)}</strong>
      {runningHere ? <span className={css.timerActive} data-timer-active><span className={css.timerDot} />Идёт таймер</span> : null}
      {props.readOnly ? null : <>
        {runningHere
          ? <button type="button" className={buttons.secondary} onClick={() => void stop()}>Стоп</button>
          : <button type="button" className={buttons.primary} onClick={() => void start()}>Старт</button>}
      </>}
    </div>
    {props.readOnly ? null : <div className={css.timeManual}>
      <label>Минуты<input type="text" inputMode="numeric" value={manual} onChange={event => setManual(event.target.value)} placeholder="45" /></label>
      <label>Заметка<input type="text" value={note} onChange={event => setNote(event.target.value)} placeholder="Что сделали" /></label>
      <button type="button" className={buttons.secondary} onClick={() => void addManual()}>Добавить</button>
      {error ? <p className={css.error} role="alert" style={{ gridColumn: '1 / -1' }}>{error}</p> : null}
    </div>}
    <ul className={css.timeList}>{mine.length ? mine.map(entry => {
      const who = props.people().find(item => item.email === entry.email)
      return <li key={entry.id} className={css.timeItem}>
        <span><strong>{who?.name || entry.email}</strong><br /><span className={css.quiet}>{formatClock(entry.startedAt)}{entry.endedAt ? ` — ${formatClock(entry.endedAt)}` : ' · идёт'}{entry.note ? ` · ${entry.note}` : ''}</span></span>
        <strong>{formatMinutes(entryMinutes(entry, props.now))}</strong>
      </li>
    }) : <li className={css.empty}>Записей времени пока нет.</li>}</ul>
  </DetailSection>
}

export function TaskRolesLine(props: Stage2Helpers & {
  authorId: string
  observerIds: string[]
  repeat: string
  every: number | null
}) {
  const author = props.people().find(item => item.id === props.authorId)
  const observers = props.observerIds.map(id => props.people().find(item => item.id === id)).filter(Boolean)
  return <div className={css.roleLine} data-task-roles>
    {author ? <span className={css.quiet}>Постановщик: <strong>{author.name}</strong></span> : null}
    {observers.length ? <span className={css.quiet}>Наблюдают: {observers.map(item => item!.name).join(', ')}</span> : null}
  </div>
}

export function CommentChat(props: Stage2Helpers & {
  taskId: string
  projectId: string
  assigneeEmail: string
  pollMs?: number
  onRefresh?: () => void
}) {
  const kit = props.kit
  const email = (props.actor.email ?? '').trim().toLowerCase()
  const names = props.people().map(item => item.name)
  const comments = props.of(kit.commentsTableId)
    .filter(row => firstId(row.values[kit.comment.task]) === props.taskId)
    .sort((a, b) => String(a.values[kit.comment.at] ?? '').localeCompare(String(b.values[kit.comment.at] ?? '')))
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!props.onRefresh || props.replace) return
    const timer = window.setInterval(() => props.onRefresh?.(), props.pollMs ?? 4000)
    return () => window.clearInterval(timer)
  }, [props.onRefresh, props.pollMs, props.replace])

  const save = async () => {
    const clean = text.trim()
    if (!clean) { setError('Напишите комментарий.'); return }
    const mentionIds = names.filter(name => clean.includes(`@${name}`)).flatMap(name => {
      const person = props.people().find(item => item.name === name)
      return person ? [person.id] : []
    })
    if (editing) {
      const stamp = new Date().toISOString()
      if (props.replace) {
        props.replace(props.rows.map(row => row.id === editing ? {
          ...row,
          values: {
            ...row.values,
            [kit.comment.text]: clean,
            ...(kit.comment.editedAt ? { [kit.comment.editedAt]: stamp } : {}),
            ...(mentionIds.length ? { [kit.comment.mentions]: mentionIds } : {}),
          },
        } : row))
        setEditing(null); setText(''); setReplyTo(null); setError(''); return
      }
      await props.saveRemote?.({ kind: 'comment-edit', recordId: editing, text: clean, mentionIds })
      setEditing(null); setText(''); setReplyTo(null); return
    }
    const values = commentWrite(kit.comment, {
      text: clean, taskId: props.taskId, projectId: props.projectId, at: new Date().toISOString(),
      author: props.actor.name?.trim() || 'Сотрудник', authorEmail: email, assigneeEmail: props.assigneeEmail,
      mentionIds, replyToId: replyTo, internal: true,
    })
    if (props.replace) {
      props.replace([...props.rows, { id: `comment_${crypto.randomUUID().replaceAll('-', '')}`, tableId: kit.commentsTableId, values }])
      setText(''); setReplyTo(null); setError(''); return
    }
    await props.saveRemote?.({ kind: 'comment', recordId: props.taskId, text: clean, mentionIds, replyToId: replyTo })
    setText(''); setReplyTo(null)
  }

  const remove = async (id: string) => {
    setMenuFor(null)
    if (props.replace) { props.replace(props.rows.filter(row => row.id !== id)); return }
    await props.saveRemote?.({ kind: 'comment-delete', recordId: id })
  }

  const replyPreview = replyTo ? comments.find(item => item.id === replyTo) : null

  return <div className={css.chat} data-task-chat>
    <ul className={css.chatList}>
      {comments.length ? comments.map(row => {
        const authorEmail = textOf(row.values[kit.comment.authorEmail]).trim().toLowerCase()
        const own = authorEmail === email
        const author = textOf(row.values[kit.comment.author])
        const who = props.people().find(item => item.email === authorEmail)
        const quotedId = kit.comment.replyTo ? firstId(row.values[kit.comment.replyTo]) : ''
        const quoted = quotedId ? comments.find(item => item.id === quotedId) : null
        return <li key={row.id} className={css.chatBubble} data-own={own || undefined}>
          <div className={css.chatMeta}>
            {who ? <BookingAvatar name={who.name} photo={who.photo} small /> : null}
            <strong>{author || 'Сотрудник'}</strong>
            <time dateTime={textOf(row.values[kit.comment.at])}>{formatCommentWhen(row.values[kit.comment.at], props.now)}</time>
            {kit.comment.editedAt && row.values[kit.comment.editedAt] ? <span>изменено</span> : null}
          </div>
          {quoted ? (() => {
            const full = textOf(quoted.values[kit.comment.text])
            const clipped = full.length > 44 ? `${full.slice(0, 43).trimEnd()}…` : full
            return <blockquote className={css.chatQuote} title={full}><span className={css.chatQuoteText}>{clipped}</span></blockquote>
          })() : null}
          <p>{textOf(row.values[kit.comment.text])}</p>
          <div className={css.chatActions}>
            <button type="button" onClick={() => { setReplyTo(row.id); setEditing(null); setMenuFor(null) }}>Ответить</button>
            {own ? <div className={css.chatMore}>
              <button type="button" aria-label="Ещё действия" aria-expanded={menuFor === row.id} onClick={() => setMenuFor(menuFor === row.id ? null : row.id)}>⋯</button>
              {menuFor === row.id ? <div className={css.chatMoreMenu}>
                <button type="button" onClick={() => { setEditing(row.id); setText(textOf(row.values[kit.comment.text])); setReplyTo(quotedId || null); setMenuFor(null) }}>Изменить</button>
                <button type="button" onClick={() => void remove(row.id)}>Удалить</button>
              </div> : null}
            </div> : null}
          </div>
        </li>
      }) : <li className={css.empty}>Комментариев пока нет.</li>}
    </ul>
    <div className={css.chatComposer}>
      {replyPreview ? <div className={css.chatReplyBar}>
        <p>В ответ: {textOf(replyPreview.values[kit.comment.text])}</p>
        <button type="button" aria-label="Отменить ответ" onClick={() => setReplyTo(null)}>×</button>
      </div> : null}
      <div className={css.chatComposerBox}>
        <textarea
          aria-label="Сообщение"
          value={text}
          onChange={event => setText(event.target.value)}
          rows={2}
          placeholder="Написать комментарий… @ — упомянуть"
        />
        <button type="button" className={css.chatSend} aria-label={editing ? 'Сохранить' : 'Отправить'} onClick={() => void save()}>
          <ProtoIcon name={editing ? 'check' : 'send'} size={18} />
        </button>
      </div>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </div>
  </div>
}

export function GanttScreen(props: Stage2Helpers & { projectId?: string }) {
  const kit = props.kit
  const projects = props.of(kit.projectsTableId)
  const [projectId, setProjectId] = useState(props.projectId || projects[0]?.id || '')
  const entries = timeEntries(props)
  const tasks = props.of(kit.tasksTableId).filter(row => firstId(row.values[kit.task.project]) === projectId).map(row => ({
    id: row.id,
    title: textOf(row.values[kit.task.title]),
    start: kit.task.start ? civilDay(row.values[kit.task.start]) : null,
    due: civilDay(row.values[kit.task.due]),
    status: props.choiceName(kit.tasksTableId, kit.task.status, row.values[kit.task.status]),
    parentId: firstId(row.values[kit.task.parent]),
    estimate: kit.task.estimate && typeof row.values[kit.task.estimate] === 'number' ? Number(row.values[kit.task.estimate]) : null,
    spent: totalSpentMinutes(entries, row.id, props.now),
  }))
  const links = dependencyLinks(props, projectId)
  const client = props.actor.roleIds.includes('client')

  const setDates = (id: string, start: string, due: string) => {
    if (!kit.task.start) return
    if (props.replace) {
      props.replace(props.rows.map(row => row.id === id ? { ...row, values: { ...row.values, [kit.task.start!]: start, [kit.task.due]: due } } : row))
      return
    }
    void props.saveRemote?.({ kind: 'gantt-dates', recordId: id, start, due })
  }

  const link = (fromId: string, toId: string) => {
    if (!kit.link || !kit.linksTableId) return
    const check = canLinkTasks(links, fromId, toId)
    if (!check.ok) return
    const fromTitle = tasks.find(task => task.id === fromId)?.title ?? ''
    const toTitle = tasks.find(task => task.id === toId)?.title ?? ''
    const values = linkWrite(kit.link, { title: `${fromTitle} → ${toTitle}`.slice(0, 120), projectId, fromId, toId })
    if (props.replace) {
      props.replace([...props.rows, { id: `link_${crypto.randomUUID().replaceAll('-', '')}`, tableId: kit.linksTableId, values }])
      return
    }
    void props.saveRemote?.({ kind: 'link-create', projectId, fromId, toId })
  }

  const unlink = (linkId: string) => {
    if (props.replace) { props.replace(props.rows.filter(row => row.id !== linkId)); return }
    void props.saveRemote?.({ kind: 'link-delete', recordId: linkId })
  }

  return <div className={css.root} data-projects-screen="gantt">
    <div className={css.toolbar}>
      <h1>Гант</h1>
      <span className={css.grow} />
    </div>
    <div className={css.pad}>
      <div className={css.choiceRow} role="radiogroup" aria-label="Проект">
        {projects.map(row => <button key={row.id} type="button" aria-pressed={row.id === projectId} onClick={() => setProjectId(row.id)}>{textOf(row.values[kit.project.title])}</button>)}
      </div>
      <ProjectsGantt
        tasks={tasks}
        links={links}
        now={props.now}
        readOnly={client}
        onOpenTask={id => props.onNavigate?.(kit.taskScreenId, id)}
        onDates={setDates}
        onLink={link}
        onUnlink={unlink}
      />
    </div>
  </div>
}

function weekdayShort(day: string) {
  const date = new Date(`${day}T12:00:00Z`)
  return ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][date.getUTCDay()] ?? ''
}

export function WorkloadScreen(props: Stage2Helpers) {
  const [mode, setMode] = useState<'day' | 'week'>('day')
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const update = () => setNarrow(window.matchMedia('(max-width: 720px)').matches)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const today = todayKey(props.now)
  const days = mode === 'day'
    ? eachDay(today, addDaysSafe(today, 6))
    : eachDay(today, weekEndKey(today)).length ? [today, ...eachDay(addDaysSafe(today, 7), addDaysSafe(weekEndKey(today), 21)).filter((_, index) => index % 7 === 0).slice(0, 3)] : [today]
  const weekDays = mode === 'week' ? [today, addDaysSafe(today, 7), addDaysSafe(today, 14), addDaysSafe(today, 21)] : days
  const columns = mode === 'day' ? days : weekDays
  const kit = props.kit
  const entries = timeEntries(props)
  const tasks = props.of(kit.tasksTableId).map(row => ({
    id: row.id,
    title: textOf(row.values[kit.task.title]),
    assigneeId: firstId(row.values[kit.task.assignee]),
    due: row.values[kit.task.due],
    estimate: kit.task.estimate && typeof row.values[kit.task.estimate] === 'number' ? Number(row.values[kit.task.estimate]) : null,
    status: props.choiceName(kit.tasksTableId, kit.task.status, row.values[kit.task.status]),
  }))
  const people = props.people().filter(person => person.active)
  const capacity = mode === 'day' ? DAY_CAPACITY : WEEK_CAPACITY
  const rows = workloadFor({ people, tasks, entries, days: columns, mode, now: props.now })

  return <div className={css.root} data-projects-screen="workload">
    <div className={css.toolbar}><h1>Нагрузка</h1><span className={css.grow} />
      <div className={css.segment} role="radiogroup" aria-label="Период" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <button type="button" aria-pressed={mode === 'day'} onClick={() => setMode('day')}>По дням</button>
        <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>По неделям</button>
      </div>
    </div>
    <div className={css.pad}>
      <div className={css.workload} data-workload>
        <div className={css.workloadGrid} style={{ ['--days' as string]: String(columns.length) }}>
          <div className={css.workloadRow}>
            <div className={`${css.workloadCell} ${css.workloadPerson}`}>Сотрудник</div>
            {columns.map(day => <div key={day} className={`${css.workloadCell} ${css.workloadCellHead}`}>{narrow ? `${formatDay(day).slice(0, 5)} ${weekdayShort(day)}` : formatDay(day)}</div>)}
            <div className={css.workloadCell}>Итого</div>
          </div>
          {rows.map(person => {
            const who = people.find(item => item.id === person.id)
            return <div key={person.id} className={css.workloadRow} data-overload={person.overloaded || undefined}>
              <div className={`${css.workloadCell} ${css.workloadPerson}`}>{who ? <BookingAvatar name={who.name} photo={who.photo} small /> : null}<span>{person.name}</span></div>
              {person.cells.map(cell => {
                const titles = tasks.filter(task => task.assigneeId === person.id && civilDay(task.due) === cell.day && !['Готово'].includes(task.status)).map(task => task.title)
                const label = cell.taskCount
                  ? cell.overload
                    ? `${formatMinutes(cell.minutes)} из ${formatMinutes(capacity)}`
                    : `${cell.taskCount} ${tasksWord(cell.taskCount)}`
                  : '—'
                return <div
                  key={cell.day}
                  className={css.workloadCell}
                  data-overload={cell.overload || undefined}
                  title={titles.length ? titles.join('\n') : undefined}
                >
                  {cell.taskCount ? <span className={css.workloadStack}>
                    <strong>{label}</strong>
                    <span>{cell.overload ? `${cell.taskCount} ${tasksWord(cell.taskCount)}` : formatMinutes(cell.minutes)}</span>
                  </span> : '—'}
                </div>
              })}
              <div className={css.workloadCell}>{formatMinutes(person.totalMinutes)}</div>
            </div>
          })}
        </div>
      </div>
    </div>
  </div>
}

function addDaysSafe(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function templateStats(payloadRaw: unknown) {
  const payload = parseTemplatePayload(payloadRaw)
  if (!payload) return { stages: 0, tasks: 0, endOffset: null as number | null }
  const ends = payload.stages.map(stage => stage.endOffset).concat(payload.tasks.map(task => task.dueOffset)).filter((value): value is number => value != null)
  return { stages: payload.stages.length, tasks: payload.tasks.filter(task => !task.parentKey).length, endOffset: ends.length ? Math.max(...ends) : null }
}

export function TemplatesScreen(props: Stage2Helpers & { initialOpen?: 'template' | 'from-template' | null }) {
  const kit = props.kit
  const templates = kit.templatesTableId ? props.of(kit.templatesTableId) : []
  const [createFrom, setCreateFrom] = useState<string | null>(props.initialOpen === 'from-template' ? templates[0]?.id ?? null : null)
  const [saveFrom, setSaveFrom] = useState(props.initialOpen === 'template')
  return <div className={css.root} data-projects-screen="templates">
    <div className={css.toolbar}><h1>Шаблоны</h1><span className={css.grow} />
      {props.leader ? <button type="button" className={buttons.primary} onClick={() => setSaveFrom(true)}>Сохранить как шаблон</button> : null}
    </div>
    <div className={css.pad}>
      <div className={css.templateGrid}>{templates.length ? templates.map(row => {
        const stats = templateStats(row.values[kit.template!.payload])
        return <article key={row.id} className={css.templateCard}>
          <strong>{textOf(row.values[kit.template!.name])}</strong>
          <p className={css.templateMeta}>{stats.stages} {stagesWord(stats.stages)} · {stats.tasks} {tasksWord(stats.tasks)} · {textOf(row.values[kit.template!.author])} · {formatDay(row.values[kit.template!.createdAt])}</p>
          <div className={css.templateActions}>
            <button type="button" className={buttons.primary} onClick={() => setCreateFrom(row.id)}>Создать проект</button>
            <button type="button" className={buttons.secondary} aria-label="Ещё" onClick={() => setCreateFrom(row.id)}>⋯</button>
          </div>
        </article>
      }) : <p className={css.empty}>Шаблонов пока нет. Сохраните проект с этапами и задачами.</p>}</div>
    </div>
    {saveFrom ? <SaveTemplateDialog {...props} onClose={() => setSaveFrom(false)} /> : null}
    {createFrom ? <CreateFromTemplateDialog {...props} templateId={createFrom} onClose={() => setCreateFrom(null)} /> : null}
  </div>
}

function SaveTemplateDialog(props: Stage2Helpers & { onClose: () => void }) {
  const formId = useId()
  const kit = props.kit
  const projects = props.of(kit.projectsTableId)
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const save = () => {
    if (!name.trim() || !projectId || !kit.template || !kit.templatesTableId) { setError('Укажите название и проект.'); return }
    const project = projects.find(item => item.id === projectId)
    const anchor = civilDay(project?.values[kit.project.start]) || todayKey(props.now)
    const stages = props.of(kit.stagesTableId).filter(row => firstId(row.values[kit.stage.project]) === projectId).map(row => ({
      id: row.id, title: textOf(row.values[kit.stage.title]), goal: textOf(row.values[kit.stage.goal]),
      start: row.values[kit.stage.start], end: row.values[kit.stage.end],
    }))
    const tasks = props.of(kit.tasksTableId).filter(row => firstId(row.values[kit.task.project]) === projectId).map(row => {
      const assigneeId = firstId(row.values[kit.task.assignee])
      const person = props.people().find(item => item.id === assigneeId)
      return {
        id: row.id, title: textOf(row.values[kit.task.title]), description: textOf(row.values[kit.task.description]),
        checklist: textOf(row.values[kit.task.checklist]) || '[]',
        priority: props.choiceName(kit.tasksTableId, kit.task.priority, row.values[kit.task.priority]),
        stageId: firstId(row.values[kit.task.stage]), parentId: firstId(row.values[kit.task.parent]),
        start: kit.task.start ? row.values[kit.task.start!] : null, due: row.values[kit.task.due],
        estimate: kit.task.estimate && typeof row.values[kit.task.estimate] === 'number' ? Number(row.values[kit.task.estimate]) : null,
        assigneeRole: person?.role || 'Исполнитель',
      }
    })
    const payload = captureProjectTemplate({ stages, tasks, anchor })
    const values = templateWrite(kit.template, {
      name: name.trim(), payload: serializeTemplatePayload(payload), createdAt: new Date().toISOString(),
      author: props.actor.name?.trim() || 'Руководитель',
    })
    if (props.replace) {
      props.replace([...props.rows, { id: `tpl_${crypto.randomUUID().replaceAll('-', '')}`, tableId: kit.templatesTableId, values }])
      props.onClose(); return
    }
    void props.saveRemote?.({ kind: 'template-save', projectId, name: name.trim() })
    props.onClose()
  }
  return <AppDialog title="Сохранить как шаблон" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={buttons.primary}>Сохранить</button>}>
    <form id={formId} className={css.form} onSubmit={event => { event.preventDefault(); save() }}>
      <label>Название шаблона<input type="text" value={name} onChange={event => setName(event.target.value)} placeholder="Например, Сайт под ключ" /></label>
      <fieldset className={css.field}><legend>Проект</legend><div className={css.choiceRow}>{projects.map(row => <button key={row.id} type="button" aria-pressed={row.id === projectId} onClick={() => setProjectId(row.id)}>{textOf(row.values[kit.project.title])}</button>)}</div></fieldset>
      {error ? <p className={css.error}>{error}</p> : null}
    </form>
  </AppDialog>
}

function CreateFromTemplateDialog(props: Stage2Helpers & { templateId: string; onClose: () => void }) {
  const formId = useId()
  const kit = props.kit
  const row = props.rows.find(item => item.id === props.templateId)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(todayKey(props.now))
  const [error, setError] = useState('')
  if (!row || !kit.template) return null
  const save = () => {
    const payload = parseTemplatePayload(row.values[kit.template!.payload])
    if (!payload) { setError('Шаблон повреждён.'); return }
    if (!title.trim()) { setError('Укажите название проекта.'); return }
    const made = materializeTemplate(payload, start)
    if (!made.ok) { setError(made.error); return }
    if (props.replace) {
      const projectId = `project_${crypto.randomUUID().replaceAll('-', '')}`
      const stageIds = new Map<string, string>()
      const taskIds = new Map<string, string>()
      const next: AppV2Record[] = [...props.rows, {
        id: projectId, tableId: kit.projectsTableId,
        values: { [kit.project.title]: title.trim(), [kit.project.start]: start, [kit.project.status]: kit.projectStatuses.active, [kit.project.progress]: 0 },
      }]
      for (const stage of made.stages) {
        const id = `stage_${crypto.randomUUID().replaceAll('-', '')}`
        stageIds.set(stage.key, id)
        next.push({
          id, tableId: kit.stagesTableId,
          values: {
            [kit.stage.title]: stage.title, [kit.stage.project]: [projectId], [kit.stage.goal]: stage.goal,
            [kit.stage.start]: stage.start, [kit.stage.end]: stage.end, [kit.stage.status]: kit.stageStatuses.planned,
          },
        })
      }
      const ordered = [...made.tasks].sort((a, b) => Number(Boolean(a.parentKey)) - Number(Boolean(b.parentKey)))
      for (const task of ordered) {
        const id = `task_${crypto.randomUUID().replaceAll('-', '')}`
        taskIds.set(task.key, id)
        const person = props.people().find(item => item.role === task.assigneeRole && item.active) || props.people().find(item => item.active)
        next.push({
          id, tableId: kit.tasksTableId,
          values: {
            [kit.task.title]: task.title, [kit.task.project]: [projectId], [kit.task.description]: task.description,
            [kit.task.checklist]: task.checklist, [kit.task.status]: kit.statuses.todo,
            [kit.task.priority]: props.choiceId(kit.tasksTableId, kit.task.priority, task.priority) || kit.priorities.medium,
            [kit.task.start!]: task.start, [kit.task.due]: task.due, [kit.task.estimate!]: task.estimate,
            [kit.task.stage]: task.stageKey && stageIds.get(task.stageKey) ? [stageIds.get(task.stageKey)!] : [],
            [kit.task.parent]: task.parentKey && taskIds.get(task.parentKey) ? [taskIds.get(task.parentKey)!] : [],
            [kit.task.assignee]: person ? [person.id] : [], [kit.task.assigneeEmail]: person?.email ?? '',
            [kit.task.sort]: 10,
          },
        })
      }
      props.replace(next)
      props.onClose()
      props.onNavigate?.(kit.projectScreenId, projectId)
      return
    }
    void props.saveRemote?.({ kind: 'template-create', templateId: props.templateId, title: title.trim(), start })
    props.onClose()
  }
  const stats = templateStats(row.values[kit.template.payload])
  const endDay = stats.endOffset != null ? addDaysSafe(start, stats.endOffset) : null
  return <AppDialog title="Проект из шаблона" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={buttons.primary}>Создать проект</button>}>
    <form id={formId} className={css.form} data-from-template onSubmit={event => { event.preventDefault(); save() }}>
      <p className={css.quiet}>Шаблон: {textOf(row.values[kit.template.name])}</p>
      <p className={css.quiet}>Будет создано: {stats.stages} {stagesWord(stats.stages)} · {stats.tasks} {tasksWord(stats.tasks)}{endDay ? ` · срок до ${formatDay(endDay)}` : ''}</p>
      <label>Название проекта<input type="text" value={title} onChange={event => setTitle(event.target.value)} /></label>
      <div className={css.field}><span>Дата старта</span><DateMenu label="Дата старта" value={start} onValue={setStart} emptyLabel="Выберите дату" /></div>
      {error ? <p className={css.error}>{error}</p> : null}
    </form>
  </AppDialog>
}

export function ClientProjectView(props: Stage2Helpers & { recordId: string }) {
  const kit = props.kit
  const row = props.rows.find(item => item.id === props.recordId)
  if (!row) return <p className={css.empty}>Проект не найден.</p>
  const progress = Number(row.values[kit.project.progress] ?? 0) || 0
  const tasks = props.of(kit.tasksTableId).filter(item => firstId(item.values[kit.task.project]) === row.id && !firstId(item.values[kit.task.parent]))
  const stages = props.of(kit.stagesTableId).filter(item => firstId(item.values[kit.stage.project]) === row.id)
  const entries = timeEntries(props)
  const ganttTasks = tasks.map(task => ({
    id: task.id,
    title: textOf(task.values[kit.task.title]),
    start: kit.task.start ? civilDay(task.values[kit.task.start!]) : null,
    due: civilDay(task.values[kit.task.due]),
    status: props.choiceName(kit.tasksTableId, kit.task.status, task.values[kit.task.status]),
    parentId: '',
    estimate: null,
    spent: 0,
  }))
  return <div className={css.root} data-projects-screen="client">
    <div className={css.pad}>
      <div className={css.clientBanner} data-client-banner><ProtoIcon name="check" size={16} />Только просмотр · внутренние комментарии и учёт времени скрыты</div>
      <h1>{textOf(row.values[kit.project.title])}</h1>
      <p className={css.quiet}>Прогресс {progress}% · срок {formatDay(row.values[kit.project.due]) || 'не указан'}</p>
      <span className={css.bar} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></span>
      <DetailSection title="Этапы">
        <ul className={css.list}>{stages.map(stage => <li key={stage.id} className={css.card}><strong>{textOf(stage.values[kit.stage.title])}</strong><span className={css.quiet}>{formatDay(stage.values[kit.stage.start])} — {formatDay(stage.values[kit.stage.end])}</span></li>)}</ul>
      </DetailSection>
      <DetailSection title="Задачи">
        <ul className={css.list}>{tasks.map(task => <li key={task.id} className={css.rowCard}><span className={css.cardTitle}>{textOf(task.values[kit.task.title])}</span><span className={css.quiet}>{props.choiceName(kit.tasksTableId, kit.task.status, task.values[kit.task.status])} · {formatDay(task.values[kit.task.due])}</span></li>)}</ul>
      </DetailSection>
      <DetailSection title="Гант">
        <ProjectsGantt tasks={ganttTasks} links={dependencyLinks(props, row.id)} now={props.now} readOnly onOpenTask={() => undefined} />
      </DetailSection>
      {/* entries intentionally unused in client view to avoid leaking time */}
      {entries.length ? null : null}
    </div>
  </div>
}

export function ShareProjectDialog(props: Stage2Helpers & { projectId: string; onClose: () => void }) {
  const kit = props.kit
  const existing = kit.sharesTableId && kit.share
    ? props.of(kit.sharesTableId).find(row => firstId(row.values[kit.share!.project]) === props.projectId)
    : null
  const [token] = useState(() => existing ? textOf(existing.values[kit.share!.token]) : shareToken())
  const [label, setLabel] = useState(existing ? textOf(existing.values[kit.share!.label]) : 'Клиент')
  const link = typeof window !== 'undefined' ? `${window.location.origin}/a/demo?share=${token}` : `?share=${token}`
  const save = () => {
    if (!kit.share || !kit.sharesTableId) return
    if (existing) {
      if (props.replace) {
        props.replace(props.rows.map(row => row.id === existing.id ? { ...row, values: { ...row.values, [kit.share!.label]: label } } : row))
      }
      props.onClose(); return
    }
    const values = shareWrite(kit.share, { token, projectId: props.projectId, label, createdAt: new Date().toISOString() })
    if (props.replace) props.replace([...props.rows, { id: `share_${crypto.randomUUID().replaceAll('-', '')}`, tableId: kit.sharesTableId, values }])
    else void props.saveRemote?.({ kind: 'share-create', projectId: props.projectId, label, token })
    props.onClose()
  }
  return <AppDialog title="Ссылка для клиента" placement="center" onClose={props.onClose} footer={<button type="button" className={buttons.primary} onClick={save}>Сохранить ссылку</button>}>
    <div className={css.shareBox} data-share-dialog>
      <label>Подпись<input type="text" value={label} onChange={event => setLabel(event.target.value)} /></label>
      <p className={css.quiet}>Клиент увидит прогресс, этапы, задачи и Гант. Комментарии и время скрыты.</p>
      <code>{link}</code>
    </div>
  </AppDialog>
}

export function RecurrenceDialog(props: Stage2Helpers & {
  value: string
  every: string
  until: string
  onChange: (value: { repeatId: string; every: string; until: string }) => void
  onClose: () => void
}) {
  const kit = props.kit
  const options = (['Не повторять', 'Ежедневно', 'Еженедельно', 'Ежемесячно', 'Свой интервал'] as const).map(name => ({
    id: kit.repeats ? props.choiceId(kit.tasksTableId, kit.task.repeat!, name) : name,
    name,
  }))
  const initialEvery = Math.max(1, Number(props.every) || 3)
  const [repeatId, setRepeatId] = useState(props.value)
  const [unit, setUnit] = useState<'days' | 'weeks'>(initialEvery % 7 === 0 ? 'weeks' : 'days')
  const [every, setEvery] = useState(String(unit === 'weeks' ? Math.max(1, Math.round(initialEvery / 7)) : initialEvery))
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [until, setUntil] = useState(props.until)
  const selected = options.find(item => item.id === repeatId)?.name ?? ''
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
  const everyDays = () => {
    const n = Math.max(1, Math.min(365, Math.floor(Number(every) || 1)))
    return String(unit === 'weeks' ? n * 7 : n)
  }
  return <AppDialog title="Повтор задачи" placement="center" onClose={props.onClose} footer={<button type="button" className={buttons.primary} onClick={() => { props.onChange({ repeatId, every: selected === 'Свой интервал' ? everyDays() : every, until }); props.onClose() }}>Готово</button>}>
    <div className={css.form} data-recurrence-dialog>
      <fieldset className={css.field}><legend>Правило</legend><div className={css.choiceRow}>{options.map(option => <button key={option.id || option.name} type="button" aria-pressed={option.id === repeatId} onClick={() => setRepeatId(option.id)}>{option.name}</button>)}</div></fieldset>
      {selected === 'Свой интервал' ? <>
        <fieldset className={css.field}><legend>Интервал</legend><div className={css.choiceRow}>
          <button type="button" aria-pressed={unit === 'days'} onClick={() => setUnit('days')}>Дни</button>
          <button type="button" aria-pressed={unit === 'weeks'} onClick={() => setUnit('weeks')}>Недели</button>
        </div></fieldset>
        <label>Каждые, {unit === 'weeks' ? 'нед.' : 'дн.'}<input type="text" inputMode="numeric" value={every} onChange={event => setEvery(event.target.value)} placeholder="3" /></label>
        {unit === 'weeks' ? <fieldset className={css.field}><legend>Дни недели</legend><div className={css.choiceRow}>{days.map((day, index) => {
          const value = index + 1
          const on = weekdays.includes(value)
          return <button key={day} type="button" aria-pressed={on} onClick={() => setWeekdays(on ? weekdays.filter(item => item !== value) : [...weekdays, value].sort((a, b) => a - b))}>{day}</button>
        })}</div></fieldset> : null}
        <p className={css.quiet}>Новая задача появится через указанный интервал после срока текущей{unit === 'weeks' && weekdays.length ? ` · дни: ${weekdays.map(day => days[day - 1]).join(', ')}` : ''}.</p>
      </> : null}
      {selected !== 'Не повторять' ? <div className={css.field}><span>Повторять до</span><DateMenu label="Повторять до" value={until} onValue={setUntil} emptyLabel="Без окончания" clearLabel="Без окончания" /></div> : null}
    </div>
  </AppDialog>
}

export function projectSpentSummary(helpers: Stage2Helpers, projectId: string) {
  const ids = helpers.of(helpers.kit.tasksTableId).filter(row => firstId(row.values[helpers.kit.task.project]) === projectId).map(row => row.id)
  return projectSpentFrom(helpers, ids)
}

function projectSpentFrom(helpers: Stage2Helpers, taskIds: string[]) {
  const entries = timeEntries(helpers)
  return taskIds.reduce((sum, id) => sum + totalSpentMinutes(entries, id, helpers.now), 0)
}

export function repeatLabelFor(helpers: Stage2Helpers, row: AppV2Record) {
  const kit = helpers.kit
  if (!kit.task.repeat) return ''
  const name = helpers.choiceName(kit.tasksTableId, kit.task.repeat, row.values[kit.task.repeat])
  const rule = repeatRuleFromName(name)
  const every = kit.task.repeatEvery && typeof row.values[kit.task.repeatEvery] === 'number' ? Number(row.values[kit.task.repeatEvery]) : null
  return recurrenceLabel(rule, every)
}

export type { RepeatRule }
export { repeatName, dependencyLinks, timeEntries }
