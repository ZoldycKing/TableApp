'use client'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import {
  columnWidth, dayIndex, eachDay, formatSpentPair, ganttArrowPath, ganttBars, ganttRange, moveBarDates, resizeBarDates,
  type DependencyLink, type GanttZoom,
} from '@/lib/projects-stage2'
import { formatDay, todayKey } from '@/lib/projects-logic'
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
  return barWidth >= Math.min(200, 36 + title.length * 7.4)
}

export function ProjectsGantt(props: Props) {
  const narrow = useNarrow()
  const [zoom, setZoom] = useState<GanttZoom>(() => isNarrowViewport() ? 'day' : 'week')
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; mode: 'move' | 'start' | 'end'; originX: number; start: string; end: string } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  const today = todayKey(props.now)
  const top = props.tasks.filter(task => !task.parentId)
  const range = useMemo(() => ganttRange(top, today, zoom === 'day' ? 2 : zoom === 'week' ? 7 : 14), [top, today, zoom])
  const days = useMemo(() => eachDay(range.start, range.end), [range.start, range.end])
  const bars = useMemo(() => ganttBars(top, range.start), [top, range.start])
  const width = columnWidth(zoom)
  const todayOffset = days.includes(today) ? dayIndex(range.start, today) : -1
  const labelWidth = narrow ? 120 : 220
  const rowHeight = narrow ? 72 : 56
  const labelPad = narrow ? 48 : 220
  const chartWidth = Math.max(days.length * width + labelPad, 1)

  useEffect(() => {
    scrolled.current = false
  }, [zoom, range.start, props.now, narrow])

  useEffect(() => {
    if (scrolled.current || !scroller.current || todayOffset < 0) return
    const node = scroller.current
    const lead = narrow ? 12 : Math.max(48, node.clientWidth * 0.35)
    node.scrollLeft = Math.max(0, todayOffset * width - lead)
    scrolled.current = true
  }, [todayOffset, width, days.length, narrow])

  const placeBar = (el: HTMLElement, start: string, end: string) => {
    el.style.left = `${dayIndex(range.start, start) * width}px`
    el.style.width = `${Math.max(1, dayIndex(start, end) + 1) * width}px`
    el.style.transform = ''
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag || props.readOnly) return
    const delta = Math.round((event.clientX - drag.originX) / width)
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
    setDrag(null)
    if (el) {
      const bar = bars.find(item => item.id === drag.id)
      if (bar) placeBar(el, bar.start, bar.end)
      delete el.dataset.previewStart
      delete el.dataset.previewEnd
    }
    if (start !== drag.start || end !== drag.end) props.onDates?.(drag.id, start, end)
  }

  const headerLabel = (day: string, index: number) => {
    if (zoom === 'day') return formatDay(day).slice(0, 5)
    if (zoom === 'week') return index % 7 === 0 ? formatDay(day).slice(0, 5) : ''
    return day.endsWith('-01') ? formatDay(day).slice(3) : ''
  }

  return <div className={css.gantt} data-projects-gantt data-narrow={narrow || undefined}>
    <div className={css.ganttToolbar}>
      <div className={css.segment} role="radiogroup" aria-label="Масштаб Ганта" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {([['day', 'Дни'], ['week', 'Недели'], ['month', 'Месяцы']] as const).map(([id, name]) => (
          <button key={id} type="button" aria-pressed={zoom === id} onClick={() => setZoom(id)}>{name}</button>
        ))}
      </div>
      {!props.readOnly ? <p className={css.quiet}>{linkFrom ? 'Выберите задачу-последователя или нажмите ещё раз, чтобы отменить' : 'Потяните полосу, чтобы сдвинуть срок. Наведите на полосу — связь «финиш → старт».'}</p> : null}
    </div>
    <div className={css.ganttFrame} style={{ '--gantt-label': `${labelWidth}px` } as CSSProperties}>
      <div className={css.ganttSide} style={{ width: labelWidth }}>
        <div className={css.ganttCorner}>Задача</div>
        {top.map(task => {
          const due = formatDay(task.due)
          const spent = task.estimate != null || task.spent ? formatSpentPair(task.spent, task.estimate) : ''
          const meta = narrow
            ? [due ? due.slice(0, 5) : 'Без срока', spent].filter(Boolean).join(' · ')
            : [due || 'Без срока', spent].filter(Boolean).join(' · ')
          return <button
            key={task.id}
            type="button"
            className={css.ganttLabel}
            style={{ height: rowHeight }}
            title={`${task.title}\n${[due || 'Без срока', spent].filter(Boolean).join(' · ')}`}
            onClick={() => props.onOpenTask(task.id)}
          >
            <strong>{task.title}</strong>
            <span>{meta}</span>
          </button>
        })}
      </div>
      <div className={css.ganttScroll} ref={scroller} onPointerMove={onPointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
        <div className={css.ganttInner} style={{ width: chartWidth }}>
          <div className={css.ganttHead} style={{ gridTemplateColumns: `repeat(${days.length}, ${width}px)` }}>
            {days.map((day, index) => <div key={day} className={css.ganttDay} data-today={day === today || undefined}>{headerLabel(day, index)}</div>)}
          </div>
          <div className={css.ganttBody} style={{ height: Math.max(top.length, 1) * rowHeight }}>
            {todayOffset >= 0 ? <div className={css.ganttToday} style={{ left: todayOffset * width }} aria-hidden /> : null}
            <svg className={css.ganttArrows} width={chartWidth} height={Math.max(top.length, 1) * rowHeight} aria-hidden>
              <defs>
                <marker id="projects-gantt-arrow" markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L10,5 L0,10 Z" fill="#4b5c6e" />
                </marker>
              </defs>
              {props.links.flatMap(link => {
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
                return <path
                  key={link.id}
                  d={ganttArrowPath(from, to, rowHeight, Math.max(4, lane))}
                  className={css.ganttArrow}
                  markerEnd="url(#projects-gantt-arrow)"
                  onClick={() => !props.readOnly && props.onUnlink?.(link.id)}
                />
              })}
            </svg>
            {top.map((task, index) => {
              const bar = bars.find(item => item.id === task.id)
              const barWidth = bar ? Math.max(bar.daySpan * width, width) : 0
              const showOutside = Boolean(bar && !narrow && !titleFits(task.title, barWidth - (props.readOnly ? 16 : 40)))
              const showInside = Boolean(bar && !narrow && !showOutside)
              return <div key={task.id} className={css.ganttRow} style={{ top: index * rowHeight, height: rowHeight }}>
                {bar ? <>
                  <div
                    className={css.ganttBar}
                    data-bar-id={bar.id}
                    data-done={bar.done || undefined}
                    data-dragging={drag?.id === bar.id || undefined}
                    style={{ left: bar.dayOffset * width, width: barWidth }}
                    onPointerDown={event => {
                      if (props.readOnly) return
                      event.currentTarget.setPointerCapture(event.pointerId)
                      setDrag({ id: bar.id, mode: 'move', originX: event.clientX, start: bar.start, end: bar.end })
                    }}
                  >
                    {!props.readOnly ? <>
                      <button type="button" className={css.ganttHandle} data-edge="start" aria-label="Изменить начало"
                        onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: bar.id, mode: 'start', originX: event.clientX, start: bar.start, end: bar.end }) }} />
                      <button type="button" className={css.ganttHandle} data-edge="end" aria-label="Изменить срок"
                        onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: bar.id, mode: 'end', originX: event.clientX, start: bar.start, end: bar.end }) }} />
                      <button type="button" className={css.ganttLinkBtn} aria-label="Связать задачу" onClick={event => {
                        event.stopPropagation()
                        if (!linkFrom) { setLinkFrom(task.id); return }
                        if (linkFrom === task.id) { setLinkFrom(null); return }
                        props.onLink?.(linkFrom, task.id)
                        setLinkFrom(null)
                      }}><ProtoIcon name="link" size={12} /></button>
                    </> : null}
                    {showInside ? <span>{task.title}</span> : null}
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
    </div>
    {linkFrom && !props.readOnly ? <div className={css.ganttHint}><button type="button" className={buttons.secondary} onClick={() => setLinkFrom(null)}>Отменить связь</button></div> : null}
  </div>
}
