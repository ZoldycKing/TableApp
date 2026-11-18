'use client'
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { AppV2Json } from '@tableapp/schema/app-v2'
import {
  columnWidth, dayIndex, eachDay, formatDayRange, formatSpentPair, ganttArrowPath, ganttBarTone, ganttBars, ganttHeaderLabel, ganttRange,
  groupTasksByWeek, isWeekendDay, moveBarDates, resizeBarDates, weekMiniBar, type DependencyLink, type GanttBarTone, type GanttZoom,
} from '@/lib/projects-stage2'
import { todayKey } from '@/lib/projects-logic'
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

function isNarrowViewport() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 720px)').matches
}

function useNarrow() {
  const [narrow, setNarrow] = useState(isNarrowViewport)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(max-width: 720px)')
    const update = () => setNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return narrow
}

function titleFits(title: string, barWidth: number) {
  return barWidth >= Math.min(168, 36 + title.length * 6.2)
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
    <span className={css.ganttPopoverProgress} data-gantt-progress>Прогресс: {progress}</span>
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

function WeekPlanList(props: {
  tasks: GanttTaskRow[]
  now: number
  onOpenTask: (id: string) => void
  onSelect: (id: string) => void
  selectedId: string | null
}) {
  const groups = useMemo(() => groupTasksByWeek(props.tasks), [props.tasks])
  if (!groups.length) {
    return <p className={css.empty} data-gantt-empty>У задач нет сроков — добавьте даты, чтобы увидеть план</p>
  }
  return <div className={css.weekPlan} data-gantt-week-plan>
    <h2 className={css.weekPlanTitle}>План по неделям</h2>
    {groups.map(group => <section key={group.monday} className={css.weekPlanGroup}>
      <h3>{group.label}</h3>
      <ul className={css.weekPlanList}>
        {group.tasks.map(task => {
          const tone = toneOf(task, props.now)
          const mini = weekMiniBar(task.start, task.due, group.monday)
          const range = formatDayRange(task.start, task.due)
          return <li key={task.id}>
            <button
              type="button"
              className={css.weekPlanRow}
              data-tone={tone}
              data-selected={props.selectedId === task.id || undefined}
              onClick={() => { props.onSelect(task.id); props.onOpenTask(task.id) }}
            >
              <span className={css.weekPlanStrip} aria-hidden data-tone={tone} />
              <span className={css.weekPlanBody}>
                <strong>{task.title}</strong>
                <span className={css.quiet}>{range || 'Без срока'} · {task.status}</span>
                {mini ? <span className={css.weekPlanMini} aria-hidden>
                  <span style={{ left: `${mini.left * 100}%`, width: `${mini.width * 100}%` }} data-tone={tone} />
                </span> : null}
              </span>
              {task.assigneeName
                ? <BookingAvatar name={task.assigneeName} photo={task.assigneePhoto} small />
                : <span className={css.weekPlanAvatar}><ProtoIcon name="user" size={16} /></span>}
            </button>
          </li>
        })}
      </ul>
    </section>)}
  </div>
}

export function ProjectsGantt(props: Props) {
  const narrow = useNarrow()
  const markerId = useId().replace(/:/g, '')
  const [zoom, setZoom] = useState<GanttZoom>(() => isNarrowViewport() ? 'day' : 'week')
  const [showLinks, setShowLinks] = useState(false)
  const [phoneMode, setPhoneMode] = useState<'list' | 'chart'>(() => isNarrowViewport() ? 'list' : 'chart')
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [popoverId, setPopoverId] = useState<string | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number } | null>(null)
  const [drag, setDrag] = useState<{ id: string; mode: 'move' | 'start' | 'end'; originX: number; start: string; end: string; moved: boolean } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  const hoverTimer = useRef<number | null>(null)
  const today = todayKey(props.now)
  const top = props.tasks.filter(task => !task.parentId)
  const dated = top.filter(task => task.start || task.due)
  const range = useMemo(() => ganttRange(top, today, zoom === 'day' ? 2 : zoom === 'week' ? 7 : 14), [top, today, zoom])
  const days = useMemo(() => eachDay(range.start, range.end), [range.start, range.end])
  const bars = useMemo(() => ganttBars(top, range.start), [top, range.start])
  const width = columnWidth(zoom)
  const todayOffset = days.includes(today) ? dayIndex(range.start, today) : -1
  const labelWidth = narrow ? 132 : 228
  const rowHeight = narrow ? 72 : 56
  const labelPad = narrow ? 48 : 220
  const chartWidth = Math.max(days.length * width + labelPad, 1)
  const popoverTask = popoverId ? top.find(task => task.id === popoverId) ?? null : null

  useEffect(() => {
    setPhoneMode(narrow ? 'list' : 'chart')
    setActiveId(null)
    setPopoverId(null)
  }, [narrow])

  useEffect(() => {
    scrolled.current = false
  }, [zoom, range.start, props.now, narrow, phoneMode])

  useEffect(() => {
    if (scrolled.current || todayOffset < 0 || (narrow && phoneMode !== 'chart')) return
    const frame = window.requestAnimationFrame(() => {
      const node = scroller.current
      if (!node || scrolled.current) return
      const lead = narrow ? Math.max(8, width * 2) : Math.max(48, node.clientWidth * 0.35)
      node.scrollLeft = Math.max(0, todayOffset * width - lead)
      scrolled.current = true
    })
    return () => window.cancelAnimationFrame(frame)
  }, [todayOffset, width, days.length, narrow, phoneMode])

  useEffect(() => () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
  }, [])

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
    const label = scroller.current?.querySelector(`[data-bar-label="${drag.id}"]`) as HTMLElement | null
    if (label) label.style.left = `${dayIndex(range.start, next.end) * width + width + 8}px`
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

  const placePopover = (id: string) => {
    const el = scroller.current?.querySelector(`[data-bar-id="${id}"]`) as HTMLElement | null
    const rect = el?.getBoundingClientRect()
    if (rect) {
      const width = 280
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8))
      const top = Math.max(8, rect.top - 12)
      setPopoverPos({ left, top })
    } else {
      setPopoverPos({ left: 24, top: 120 })
    }
    setActiveId(id)
    setPopoverId(id)
  }

  const openPopover = (id: string, fromHover = false) => {
    if (fromHover && narrow) return
    if (fromHover) {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
      hoverTimer.current = window.setTimeout(() => placePopover(id), 120)
      return
    }
    placePopover(id)
  }

  const leavePopover = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    if (!narrow) {
      hoverTimer.current = window.setTimeout(() => {
        setPopoverId(null)
        setActiveId(null)
        setPopoverPos(null)
      }, 180)
    }
  }

  const keepPopover = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
  }

  const closePopover = () => {
    setPopoverId(null)
    setActiveId(null)
    setPopoverPos(null)
  }

  const linkVisible = (link: DependencyLink) => {
    if (showLinks) return true
    if (!activeId) return false
    return link.fromId === activeId || link.toId === activeId
  }

  const linkActive = (link: DependencyLink) => Boolean(activeId && (link.fromId === activeId || link.toId === activeId))

  if (narrow && phoneMode === 'list') {
    return <div className={css.gantt} data-projects-gantt data-narrow data-phone-mode="list">
      <div className={css.ganttToolbar}>
        <p className={css.ganttExplainer}>План проекта на календаре: каждая полоса — задача от начала до срока.</p>
        <div className={css.segment} role="radiogroup" aria-label="Вид плана" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <button type="button" aria-pressed onClick={() => { setPhoneMode('list'); setActiveId(null); setPopoverId(null); setShowLinks(false) }}>Список</button>
          <button type="button" aria-pressed={false} onClick={() => { setPhoneMode('chart'); setActiveId(null); setPopoverId(null) }}>Диаграмма</button>
        </div>
        <ul className={css.ganttLegend} aria-label="Обозначения">
          {LEGEND.map(item => <li key={item.tone}><span className={css.ganttSwatch} data-tone={item.tone} /><span>{item.label}</span></li>)}
        </ul>
      </div>
      <WeekPlanList
        tasks={top}
        now={props.now}
        selectedId={activeId}
        onSelect={setActiveId}
        onOpenTask={props.onOpenTask}
      />
    </div>
  }

  const noDates = top.length > 0 && dated.length === 0

  return <div className={css.gantt} data-projects-gantt data-narrow={narrow || undefined} data-phone-mode={narrow ? 'chart' : undefined}>
    <div className={css.ganttToolbar}>
      <p className={css.ganttExplainer}>План проекта на календаре: каждая полоса — задача от начала до срока.</p>
      {narrow ? <div className={css.segment} role="radiogroup" aria-label="Вид плана" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <button type="button" aria-pressed={false} onClick={() => { setPhoneMode('list'); setActiveId(null); setPopoverId(null); setShowLinks(false) }}>Список</button>
        <button type="button" aria-pressed onClick={() => { setPhoneMode('chart'); setActiveId(null); setPopoverId(null) }}>Диаграмма</button>
      </div> : null}
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
    {noDates ? <p className={css.empty} data-gantt-empty>У задач нет сроков — добавьте даты, чтобы увидеть план</p> : <div className={css.ganttFrame} style={{ '--gantt-label': `${labelWidth}px` } as CSSProperties}>
      <div className={css.ganttSide} style={{ width: labelWidth }}>
        <div className={css.ganttCorner}>Задача</div>
        {top.map(task => {
          const tone = toneOf(task, props.now)
          const rangeLabel = formatDayRange(task.start, task.due) || 'Без срока'
          return <button
            key={task.id}
            type="button"
            className={css.ganttLabel}
            style={{ height: rowHeight }}
            data-active={activeId === task.id || undefined}
            title={`${task.title}\n${rangeLabel}`}
            onClick={() => { setActiveId(task.id); props.onOpenTask(task.id) }}
            onMouseEnter={() => openPopover(task.id, true)}
            onMouseLeave={leavePopover}
          >
            <span className={css.ganttLabelTitle}>
              <span className={css.ganttStatusDot} data-tone={tone} aria-hidden />
              <strong>{task.title}</strong>
            </span>
            <span>{rangeLabel}</span>
          </button>
        })}
      </div>
      <div className={css.ganttScroll} ref={scroller} onPointerMove={onPointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
        <div className={css.ganttInner} style={{ width: chartWidth }}>
          <div className={css.ganttHead} style={{ gridTemplateColumns: `repeat(${days.length}, ${width}px)` }}>
            {days.map((day, index) => <div
              key={day}
              className={css.ganttDay}
              data-today={day === today || undefined}
              data-weekend={zoom === 'day' && isWeekendDay(day) || undefined}
            >{ganttHeaderLabel(day, index, zoom)}</div>)}
          </div>
          <div className={css.ganttBody} style={{ height: Math.max(top.length, 1) * rowHeight }}>
            {zoom === 'day' ? days.map((day, index) => isWeekendDay(day) ? <div
              key={`we-${day}`}
              className={css.ganttWeekend}
              style={{ left: index * width, width }}
              aria-hidden
            /> : null) : null}
            {todayOffset >= 0 ? <div className={css.ganttToday} style={{ left: todayOffset * width }} aria-hidden /> : null}
            <svg className={css.ganttArrows} width={chartWidth} height={Math.max(top.length, 1) * rowHeight} aria-hidden>
              <defs>
                <marker id={`projects-gantt-arrow-${markerId}`} markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L10,5 L0,10 Z" fill="currentColor" />
                </marker>
              </defs>
              {props.links.flatMap(link => {
                if (!linkVisible(link)) return []
                const fromBar = bars.find(bar => bar.id === link.fromId)
                const toBar = bars.find(bar => bar.id === link.toId)
                const fromIndex = top.findIndex(task => task.id === link.fromId)
                const toIndex = top.findIndex(task => task.id === link.toId)
                if (!fromBar || !toBar || fromIndex < 0 || toIndex < 0) return []
                const from = { x: (fromBar.dayOffset + fromBar.daySpan) * width, y: fromIndex * rowHeight + rowHeight / 2 }
                const to = { x: toBar.dayOffset * width, y: toIndex * rowHeight + rowHeight / 2 }
                const lo = Math.min(fromIndex, toIndex)
                const hi = Math.max(fromIndex, toIndex)
                let lane = Math.min(from.x, to.x) - 48
                for (let i = lo; i <= hi; i += 1) {
                  const mid = bars.find(bar => bar.id === top[i]!.id)
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
            </svg>
            {top.map((task, index) => {
              const bar = bars.find(item => item.id === task.id)
              const tone = toneOf(task, props.now)
              const barWidth = bar ? Math.max(bar.daySpan * width, width) : 0
              const showOutside = Boolean(bar && !narrow && !titleFits(task.title, barWidth - (props.readOnly ? 28 : 52)))
              const showInside = Boolean(bar && !narrow && !showOutside)
              return <div key={task.id} className={css.ganttRow} style={{ top: index * rowHeight, height: rowHeight }}>
                {bar ? <>
                  <div
                    className={css.ganttBar}
                    data-bar-id={bar.id}
                    data-tone={tone}
                    data-active={activeId === task.id || undefined}
                    data-dragging={drag?.id === bar.id || undefined}
                    style={{ left: bar.dayOffset * width, width: barWidth }}
                    onPointerDown={event => {
                      if (props.readOnly) {
                        openPopover(task.id)
                        return
                      }
                      event.currentTarget.setPointerCapture?.(event.pointerId)
                      setDrag({ id: bar.id, mode: 'move', originX: event.clientX, start: bar.start, end: bar.end, moved: false })
                      setActiveId(task.id)
                    }}
                    onClick={() => {
                      if (drag?.moved) return
                      openPopover(task.id)
                    }}
                    onMouseEnter={() => openPopover(task.id, true)}
                    onMouseLeave={leavePopover}
                  >
                    {task.assigneeName ? <span className={css.ganttBarAvatar}><BookingAvatar name={task.assigneeName} photo={task.assigneePhoto} small /></span> : null}
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
                    {showInside ? <span className={css.ganttBarTitle}>{task.title}</span> : null}
                  </div>
                  {showOutside ? <span
                    className={css.ganttBarLabel}
                    data-bar-label={bar.id}
                    title={task.title}
                    style={{ left: (bar.dayOffset + bar.daySpan) * width + 8, top: Math.max(14, (rowHeight - 18) / 2) }}
                  >{task.title}</span> : null}
                </> : <button type="button" className={css.ganttEmpty} style={{ left: 8 }} onClick={() => props.onOpenTask(task.id)}>Нет дат</button>}
              </div>
            })}
            {!top.length ? <p className={css.empty} style={{ padding: 16 }}>В проекте пока нет задач для Ганта.</p> : null}
          </div>
        </div>
      </div>
    </div>}
    {popoverTask && popoverPos ? <div
      className={css.ganttPopoverFixed}
      style={{ left: popoverPos.left, top: popoverPos.top, transform: 'translateY(-100%)' }}
      onMouseEnter={keepPopover}
      onMouseLeave={leavePopover}
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
