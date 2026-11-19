'use client'
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { AppV2Json } from '@tableapp/schema/app-v2'
import {
  columnWidth, dayIndex, eachDay, formatDayRange, formatDayRangeSpaced, formatSpentPair, ganttArrowPath,
  ganttBarProgress, ganttBarTone, ganttBars, ganttCaptionPlacement, ganttCaptionWidth, ganttHeaderLabel,
  ganttHeaderLabelVisible, ganttRange, isWeekendDay, moveBarDates, projectMiniBar, resizeBarDates,
  type DependencyLink, type GanttBarTone, type GanttZoom,
} from '@/lib/projects-stage2'
import { isOverdue, todayKey } from '@/lib/projects-logic'
import { BookingAvatar } from './booking-avatar'
import { ProtoIcon } from '../prototype/icons'
import buttons from '../prototype/prototype.module.css'
import css from './projects.module.css'

export type GanttTaskRow = {
  id: string
  title: string
  start: string | null
  due: string | null
  status: string
  parentId: string
  estimate: number | null
  spent: number
  assigneeName?: string
  assigneePhoto?: AppV2Json
}

type Props = {
  tasks: GanttTaskRow[]
  links: DependencyLink[]
  now: number
  readOnly?: boolean
  onOpenTask: (id: string) => void
  onDates?: (id: string, start: string, due: string) => void
  onLink?: (fromId: string, toId: string) => void
  onUnlink?: (linkId: string) => void
}

const LEGEND: { tone: GanttBarTone | 'today'; label: string }[] = [
  { tone: 'done', label: 'Готово' },
  { tone: 'progress', label: 'В работе' },
  { tone: 'review', label: 'На проверке' },
  { tone: 'overdue', label: 'Просрочено' },
  { tone: 'today', label: 'Сегодня' },
]

/** Phone breakpoint: viewports below 768px. */
const NARROW_QUERY = '(max-width: 767px)'

function isNarrowViewport() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(NARROW_QUERY).matches
}

function useNarrow() {
  const [narrow, setNarrow] = useState(isNarrowViewport)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(NARROW_QUERY)
    const update = () => setNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return narrow
}

/** Родители, затем их подзадачи; сироты — в конце. */
function flattenGanttRows(tasks: GanttTaskRow[]): GanttTaskRow[] {
  const tops = tasks.filter(task => !task.parentId)
  const seen = new Set<string>()
  const rows: GanttTaskRow[] = []
  for (const parent of tops) {
    rows.push(parent)
    seen.add(parent.id)
    for (const child of tasks) {
      if (child.parentId !== parent.id || seen.has(child.id)) continue
      rows.push(child)
      seen.add(child.id)
    }
  }
  for (const task of tasks) {
    if (seen.has(task.id)) continue
    rows.push(task)
    seen.add(task.id)
  }
  return rows
}

function toneOf(task: GanttTaskRow, now: number): GanttBarTone {
  return ganttBarTone(task.status, task.due, now)
}

function GanttPopover(props: {
  task: GanttTaskRow
  now: number
  readOnly?: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const range = formatDayRange(props.task.start, props.task.due) || 'Без срока'
  const progress = formatSpentPair(props.task.spent, props.task.estimate)
  return <div className={css.ganttPopover} role="dialog" aria-label={props.task.title} data-gantt-popover>
    <strong>{props.task.title}</strong>
    <span className={css.quiet}>{range}</span>
    <span className={css.ganttPopoverStatus} data-tone={toneOf(props.task, props.now)}>{props.task.status || 'Без статуса'}</span>
    <span className={`${css.quiet} ${css.ganttPopoverProgress}`} data-gantt-progress>Прогресс: {progress}</span>
    {props.task.assigneeName ? <span className={css.ganttPopoverWho}>
      <BookingAvatar name={props.task.assigneeName} photo={props.task.assigneePhoto} small />
      <span>{props.task.assigneeName}</span>
    </span> : null}
    <div className={css.ganttPopoverActions}>
      {!props.readOnly ? <button type="button" className={buttons.primary} onClick={props.onOpen}>Открыть задачу</button> : null}
      <button type="button" className={buttons.secondary} onClick={props.onClose}>Закрыть</button>
    </div>
  </div>
}

function DeadlinesList(props: {
  tasks: GanttTaskRow[]
  now: number
  onOpenTask: (id: string) => void
}) {
  const today = todayKey(props.now)
  const { projectStart, projectEnd, hasDates } = useMemo(() => {
    const days = props.tasks.flatMap(task => [task.start, task.due].filter(Boolean) as string[])
    if (!days.length) return { projectStart: today, projectEnd: today, hasDates: false }
    return {
      projectStart: days.reduce((a, b) => a < b ? a : b),
      projectEnd: days.reduce((a, b) => a > b ? a : b),
      hasDates: true,
    }
  }, [props.tasks, today])

  if (!hasDates) {
    return <p className={css.empty} data-gantt-empty>У задач нет сроков — добавьте даты, чтобы увидеть план</p>
  }

  return <div className={css.deadlines} data-gantt-deadlines>
    <h2 className={css.deadlinesTitle}>Сроки</h2>
    <ul className={css.deadlinesList}>
      {props.tasks.map(task => {
        if (!task.start && !task.due) return null
        const tone = toneOf(task, props.now)
        const nested = Boolean(task.parentId)
        const overdue = isOverdue({ status: task.status, due: task.due }, props.now)
        const range = formatDayRangeSpaced(task.start, task.due) || 'Без срока'
        const mini = projectMiniBar(task.start, task.due, projectStart, projectEnd, today)
        return <li key={task.id} data-nested={nested || undefined}>
          <button
            type="button"
            className={css.deadlinesCard}
            data-tone={tone}
            data-overdue={overdue || undefined}
            data-nested={nested || undefined}
            onClick={() => props.onOpenTask(task.id)}
          >
            <span className={css.ganttStatusDot} data-tone={tone} aria-hidden />
            <span className={css.deadlinesBody}>
              <strong title={task.title}>{task.title}</strong>
              <span className={css.deadlinesDates} data-overdue={overdue || undefined}>{range}</span>
              {mini ? <span className={css.deadlinesMini} aria-hidden>
                <span className={css.deadlinesMiniTrack} />
                <span
                  className={css.deadlinesMiniBar}
                  data-tone={tone}
                  style={{ left: `${mini.left * 100}%`, width: `${Math.max(mini.width * 100, 2)}%` }}
                />
                {mini.todayAt != null ? <span className={css.deadlinesMiniToday} style={{ left: `${mini.todayAt * 100}%` }} /> : null}
              </span> : null}
            </span>
            {task.assigneeName
              ? <BookingAvatar name={task.assigneeName} photo={task.assigneePhoto} small />
              : <span className={css.deadlinesAvatar} aria-hidden><ProtoIcon name="user" size={16} /></span>}
          </button>
        </li>
      })}
    </ul>
  </div>
}

export function ProjectsGantt(props: Props) {
  const narrow = useNarrow()
  const markerId = useId().replace(/:/g, '')
  const [zoom, setZoom] = useState<GanttZoom>('week')
  const [showLinks, setShowLinks] = useState(false)
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [popoverId, setPopoverId] = useState<string | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number } | null>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewWidth, setViewWidth] = useState(0)
  const [drag, setDrag] = useState<{ id: string; mode: 'move' | 'start' | 'end'; originX: number; start: string; end: string; moved: boolean } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  const today = todayKey(props.now)
  const rows = useMemo(() => flattenGanttRows(props.tasks), [props.tasks])
  const dated = rows.filter(task => task.start || task.due)
  const range = useMemo(() => ganttRange(rows, today, zoom === 'day' ? 2 : zoom === 'week' ? 7 : 14), [rows, today, zoom])
  const days = useMemo(() => eachDay(range.start, range.end), [range.start, range.end])
  const bars = useMemo(() => ganttBars(rows, range.start), [rows, range.start])
  const width = columnWidth(zoom)
  const todayOffset = days.includes(today) ? dayIndex(range.start, today) : -1
  const labelWidth = narrow ? 168 : 304
  const rowHeight = 48
  const chartWidth = Math.max(days.length * width + 24, 1)
  const popoverTask = popoverId ? rows.find(task => task.id === popoverId) ?? null : null
  const highlightId = hoverId || activeId

  useEffect(() => {
    setActiveId(null)
    setHoverId(null)
    setPopoverId(null)
  }, [narrow])

  useEffect(() => {
    scrolled.current = false
  }, [zoom, range.start, props.now, narrow])

  useEffect(() => {
    if (narrow || scrolled.current || todayOffset < 0) return
    const frame = window.requestAnimationFrame(() => {
      const node = scroller.current
      if (!node || scrolled.current) return
      const lead = Math.max(48, node.clientWidth * 0.35)
      const next = Math.max(0, todayOffset * width - lead)
      node.scrollLeft = next
      setScrollLeft(next)
      setViewWidth(node.clientWidth)
      scrolled.current = true
    })
    return () => window.cancelAnimationFrame(frame)
  }, [todayOffset, width, days.length, narrow])

  useEffect(() => {
    if (narrow) return
    const node = scroller.current
    if (!node) return
    const measure = () => {
      const next = node.clientWidth
      if (next > 0) setViewWidth(current => (current === next ? current : next))
    }
    measure()
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [narrow, rows.length, zoom, chartWidth])

  const placeBar = (el: HTMLElement, start: string, end: string) => {
    el.style.left = `${dayIndex(range.start, start) * width}px`
    el.style.width = `${Math.max(1, dayIndex(start, end) + 1) * width}px`
    el.style.transform = ''
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag || props.readOnly) return
    const delta = Math.round((event.clientX - drag.originX) / width)
    if (delta !== 0 && !drag.moved) setDrag({ ...drag, moved: true })
    const next = drag.mode === 'move'
      ? moveBarDates(drag.start, drag.end, delta)
      : resizeBarDates(drag.start, drag.end, drag.mode === 'start' ? 'start' : 'end', delta)
    const el = scroller.current?.querySelector(`[data-bar-id="${drag.id}"]`) as HTMLElement | null
    if (!el) return
    placeBar(el, next.start, next.end)
    el.dataset.previewStart = next.start
    el.dataset.previewEnd = next.end
  }

  const finishDrag = () => {
    if (!drag || props.readOnly) { setDrag(null); return }
    const el = scroller.current?.querySelector(`[data-bar-id="${drag.id}"]`) as HTMLElement | null
    const start = el?.dataset.previewStart || drag.start
    const end = el?.dataset.previewEnd || drag.end
    const moved = drag.moved
    const id = drag.id
    setDrag(null)
    if (el) {
      const bar = bars.find(item => item.id === id)
      if (bar) placeBar(el, bar.start, bar.end)
      delete el.dataset.previewStart
      delete el.dataset.previewEnd
    }
    if (moved && (start !== drag.start || end !== drag.end)) props.onDates?.(id, start, end)
    else if (!moved) placePopover(id)
  }

  const placePopover = (id: string, anchor?: HTMLElement | null) => {
    const el = anchor
      ?? (scroller.current?.querySelector(`[data-bar-id="${id}"]`) as HTMLElement | null)
      ?? (document.querySelector(`[data-gantt-label="${id}"]`) as HTMLElement | null)
    const rect = el?.getBoundingClientRect()
    if (rect) {
      const box = 280
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - box - 8))
      const top = Math.max(8, rect.top - 12)
      setPopoverPos({ left, top })
    } else {
      setPopoverPos({ left: 24, top: 120 })
    }
    setActiveId(id)
    setPopoverId(id)
  }

  const openPopover = (id: string, anchor?: HTMLElement | null) => {
    placePopover(id, anchor)
  }

  const closePopover = () => {
    setPopoverId(null)
    setActiveId(null)
    setPopoverPos(null)
  }

  /** Связи только при включённом «Показать связи» — иначе в шкале остаётся лишь линия «Сегодня». */
  const linkVisible = (_link: DependencyLink) => showLinks

  const linkActive = (link: DependencyLink) => {
    const focus = activeId || hoverId
    return Boolean(showLinks && focus && (link.fromId === focus || link.toId === focus))
  }

  const enterRow = (id: string) => setHoverId(id)
  const leaveRow = (id: string) => setHoverId(current => current === id ? null : current)

  if (narrow) {
    return <div className={css.gantt} data-projects-gantt data-narrow data-phone-mode="list">
      <div className={css.ganttToolbar}>
        <ul className={`${css.ganttLegend} ${css.ganttLegendCompact}`} aria-label="Обозначения">
          {LEGEND.map(item => <li key={item.tone}><span className={css.ganttSwatch} data-tone={item.tone} /><span>{item.label}</span></li>)}
        </ul>
      </div>
      <DeadlinesList tasks={rows} now={props.now} onOpenTask={props.onOpenTask} />
    </div>
  }

  const noDates = rows.length > 0 && dated.length === 0
  // Prefer measured scroller width; never fall back to full chart width (that
  // keeps captions on the right until they clip at the visible edge).
  const timelineViewWidth = viewWidth > 0 ? viewWidth : 0

  return <div className={css.gantt} data-projects-gantt>
    <div className={css.ganttToolbar}>
      <p className={css.ganttExplainer}>План проекта на календаре: каждая полоса — задача от начала до срока.</p>
      <div className={css.ganttToolbarRow}>
        <div className={css.segment} role="radiogroup" aria-label="Масштаб Ганта" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {([['day', 'Дни'], ['week', 'Недели'], ['month', 'Месяцы']] as const).map(([id, name]) => (
            <button key={id} type="button" aria-pressed={zoom === id} onClick={() => setZoom(id)}>{name}</button>
          ))}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showLinks}
          className={css.ganttToggle}
          data-on={showLinks || undefined}
          onClick={() => setShowLinks(value => !value)}
        >
          <span>Показать связи</span>
          <i aria-hidden="true" />
        </button>
      </div>
      <ul className={css.ganttLegend} aria-label="Обозначения">
        {LEGEND.map(item => <li key={item.tone}><span className={css.ganttSwatch} data-tone={item.tone} /><span>{item.label}</span></li>)}
      </ul>
      {!props.readOnly ? <p className={css.ganttDragHint} title="Потяните полосу, чтобы сдвинуть срок. Наведите на полосу — связь «финиш → старт».">
        {linkFrom ? 'Выберите задачу-последователя или нажмите ещё раз, чтобы отменить' : 'Потяните полосу, чтобы сдвинуть срок'}
      </p> : null}
    </div>
    {noDates ? <p className={css.empty} data-gantt-empty>У задач нет сроков — добавьте даты, чтобы увидеть план</p> : <div className={css.ganttFrame} style={{ '--gantt-label': `${labelWidth}px`, '--gantt-row': `${rowHeight}px` } as CSSProperties}>
      <div className={css.ganttSide} style={{ width: labelWidth }} data-gantt-names>
        <div className={css.ganttCorner}>Задача</div>
        {rows.map(task => {
          const tone = toneOf(task, props.now)
          const nested = Boolean(task.parentId)
          const lit = highlightId === task.id
          return <button
            key={task.id}
            type="button"
            className={css.ganttLabel}
            style={{ height: rowHeight }}
            data-gantt-label={task.id}
            data-nested={nested || undefined}
            data-active={activeId === task.id || undefined}
            data-hover={lit || undefined}
            title={task.title}
            onClick={event => openPopover(task.id, event.currentTarget)}
            onMouseEnter={() => enterRow(task.id)}
            onMouseLeave={() => leaveRow(task.id)}
            onFocus={() => enterRow(task.id)}
            onBlur={() => leaveRow(task.id)}
          >
            <span className={css.ganttStatusDot} data-tone={tone} aria-hidden />
            <span className={css.ganttLabelBody}>
              {nested ? <span className={css.ganttTree} data-gantt-tree aria-hidden /> : null}
              <strong>{task.title}</strong>
            </span>
          </button>
        })}
      </div>
      <div
        className={css.ganttScroll}
        ref={scroller}
        onScroll={event => {
          setScrollLeft(event.currentTarget.scrollLeft)
          const next = event.currentTarget.clientWidth
          if (next > 0) setViewWidth(current => (current === next ? current : next))
        }}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div className={css.ganttInner} style={{ width: chartWidth }}>
          <div className={css.ganttHead} data-zoom={zoom} style={{ gridTemplateColumns: `repeat(${days.length}, ${width}px)` }}>
            {days.map((day, index) => {
              const label = ganttHeaderLabel(day, index, zoom)
              const show = ganttHeaderLabelVisible(index, width, label, zoom, scrollLeft)
              return <div
                key={day}
                className={css.ganttDay}
                data-today={day === today || undefined}
                data-weekend={zoom === 'day' && isWeekendDay(day) || undefined}
                data-label={show || undefined}
                title={show ? label : undefined}
              >
                {day === today ? <span className={css.ganttTodayLabel}>Сегодня</span> : (show ? label : '')}
              </div>
            })}
          </div>
          <div className={css.ganttBody} style={{ height: Math.max(rows.length, 1) * rowHeight }}>
            {zoom === 'day' ? days.map((day, index) => isWeekendDay(day) ? <div
              key={`we-${day}`}
              className={css.ganttWeekend}
              style={{ left: index * width, width }}
              aria-hidden
            /> : null) : null}
            {todayOffset >= 0 ? <div className={css.ganttToday} style={{ left: todayOffset * width }} aria-hidden /> : null}
            {showLinks ? <svg className={css.ganttArrows} width={chartWidth} height={Math.max(rows.length, 1) * rowHeight} aria-hidden>
              <defs>
                <marker id={`projects-gantt-arrow-${markerId}`} markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L10,5 L0,10 Z" fill="currentColor" />
                </marker>
              </defs>
              {props.links.flatMap(link => {
                if (!linkVisible(link)) return []
                const fromBar = bars.find(bar => bar.id === link.fromId)
                const toBar = bars.find(bar => bar.id === link.toId)
                const fromIndex = rows.findIndex(task => task.id === link.fromId)
                const toIndex = rows.findIndex(task => task.id === link.toId)
                if (!fromBar || !toBar || fromIndex < 0 || toIndex < 0) return []
                const from = { x: (fromBar.dayOffset + fromBar.daySpan) * width, y: fromIndex * rowHeight + rowHeight / 2 }
                const to = { x: toBar.dayOffset * width, y: toIndex * rowHeight + rowHeight / 2 }
                const lo = Math.min(fromIndex, toIndex)
                const hi = Math.max(fromIndex, toIndex)
                let lane = Math.min(from.x, to.x) - 48
                for (let i = lo; i <= hi; i += 1) {
                  const mid = bars.find(bar => bar.id === rows[i]!.id)
                  if (mid) lane = Math.min(lane, mid.dayOffset * width - 16)
                }
                const active = linkActive(link)
                return <path
                  key={link.id}
                  d={ganttArrowPath(from, to, rowHeight, Math.max(4, lane))}
                  className={css.ganttArrow}
                  data-gantt-link={link.id}
                  data-active={active || undefined}
                  data-dimmed={showLinks && activeId && !active || undefined}
                  markerEnd={`url(#projects-gantt-arrow-${markerId})`}
                  onClick={() => !props.readOnly && props.onUnlink?.(link.id)}
                />
              })}
            </svg> : null}
            {rows.map((task, index) => {
              const bar = bars.find(item => item.id === task.id)
              const tone = toneOf(task, props.now)
              const barWidth = bar ? Math.max(bar.daySpan * width, width) : 0
              const barLeft = bar ? bar.dayOffset * width : 0
              const progress = ganttBarProgress(task.spent, task.estimate, task.status)
              const lit = highlightId === task.id
              const captionW = ganttCaptionWidth(task.title, Boolean(task.assigneeName))
              const placement = bar && timelineViewWidth > 0 ? ganttCaptionPlacement({
                barLeft,
                barWidth,
                labelWidth: captionW,
                viewLeft: scrollLeft,
                viewWidth: timelineViewWidth,
              }) : { side: 'right' as const, maxWidth: Math.min(captionW, 160) }
              return <div
                key={task.id}
                className={css.ganttRow}
                style={{ top: index * rowHeight, height: rowHeight }}
                data-gantt-row={task.id}
                data-hover={lit || undefined}
                data-active={activeId === task.id || undefined}
                onMouseEnter={() => enterRow(task.id)}
                onMouseLeave={() => leaveRow(task.id)}
              >
                {bar ? (
                  <div
                    className={css.ganttBarWrap}
                    data-bar-id={bar.id}
                    style={{ left: barLeft, width: barWidth }}
                  >
                    <div
                      className={css.ganttBar}
                      data-tone={tone}
                      data-active={activeId === task.id || undefined}
                      data-dragging={drag?.id === bar.id || undefined}
                      title={task.title}
                      onPointerDown={event => {
                        if (props.readOnly) {
                          openPopover(task.id, event.currentTarget)
                          return
                        }
                        event.currentTarget.setPointerCapture?.(event.pointerId)
                        setDrag({ id: bar.id, mode: 'move', originX: event.clientX, start: bar.start, end: bar.end, moved: false })
                        setActiveId(task.id)
                      }}
                      onClick={event => {
                        if (drag?.moved) return
                        openPopover(task.id, event.currentTarget)
                      }}
                      onMouseEnter={() => enterRow(task.id)}
                      onMouseLeave={() => leaveRow(task.id)}
                    >
                      {progress > 0 ? <span className={css.ganttBarFill} data-gantt-fill style={{ width: `${progress}%` }} aria-hidden /> : null}
                      {!props.readOnly ? <>
                        <button type="button" className={css.ganttHandle} data-edge="start" aria-label="Изменить начало"
                          onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture?.(event.pointerId); setDrag({ id: bar.id, mode: 'start', originX: event.clientX, start: bar.start, end: bar.end, moved: false }) }} />
                        <button type="button" className={css.ganttHandle} data-edge="end" aria-label="Изменить срок"
                          onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture?.(event.pointerId); setDrag({ id: bar.id, mode: 'end', originX: event.clientX, start: bar.start, end: bar.end, moved: false }) }} />
                        <button type="button" className={css.ganttLinkBtn} aria-label="Связать задачу" onClick={event => {
                          event.stopPropagation()
                          if (!linkFrom) { setLinkFrom(task.id); return }
                          if (linkFrom === task.id) { setLinkFrom(null); return }
                          props.onLink?.(linkFrom, task.id)
                          setLinkFrom(null)
                        }}><ProtoIcon name="link" size={12} /></button>
                      </> : null}
                    </div>
                    {placement.maxWidth >= 24 ? <button
                      type="button"
                      className={css.ganttBarCaption}
                      data-bar-label={bar.id}
                      data-side={placement.side}
                      title={task.title}
                      style={{ maxWidth: placement.maxWidth }}
                      onClick={event => openPopover(task.id, event.currentTarget)}
                      onMouseEnter={() => enterRow(task.id)}
                      onMouseLeave={() => leaveRow(task.id)}
                    >
                      {task.assigneeName ? <span className={css.ganttBarAvatar}><BookingAvatar name={task.assigneeName} photo={task.assigneePhoto} small /></span> : null}
                      <span className={css.ganttBarCaptionText}>{task.title}</span>
                    </button> : null}
                  </div>
                ) : null}
              </div>
            })}
            {!rows.length ? <p className={css.empty} style={{ padding: 16 }}>В проекте пока нет задач для Ганта.</p> : null}
          </div>
        </div>
      </div>
    </div>}
    {popoverTask && popoverPos ? <div
      className={css.ganttPopoverFixed}
      style={{ left: popoverPos.left, top: popoverPos.top, transform: 'translateY(-100%)' }}
    >
      <GanttPopover
        task={popoverTask}
        now={props.now}
        readOnly={props.readOnly}
        onOpen={() => props.onOpenTask(popoverTask.id)}
        onClose={closePopover}
      />
    </div> : null}
    {linkFrom && !props.readOnly ? <div className={css.ganttHint}><button type="button" className={buttons.secondary} onClick={() => setLinkFrom(null)}>Отменить связь</button></div> : null}
  </div>
}
