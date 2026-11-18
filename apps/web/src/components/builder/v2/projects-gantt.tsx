'use client'
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  columnWidth, dayIndex, eachDay, formatMinutes, ganttArrowPath, ganttBars, ganttRange, moveBarDates, resizeBarDates,
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

export function ProjectsGantt(props: Props) {
  const [zoom, setZoom] = useState<GanttZoom>('week')
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; mode: 'move' | 'start' | 'end'; originX: number; start: string; end: string } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const today = todayKey(props.now)
  const top = props.tasks.filter(task => !task.parentId)
  const range = useMemo(() => ganttRange(top, today, zoom === 'day' ? 2 : zoom === 'week' ? 7 : 14), [top, today, zoom])
  const days = useMemo(() => eachDay(range.start, range.end), [range.start, range.end])
  const bars = useMemo(() => ganttBars(top, range.start), [top, range.start])
  const width = columnWidth(zoom)
  const todayOffset = days.includes(today) ? dayIndex(range.start, today) : -1
  const rowHeight = 44
  const labelWidth = 200

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag || props.readOnly) return
    const delta = Math.round((event.clientX - drag.originX) / width)
    const next = drag.mode === 'move'
      ? moveBarDates(drag.start, drag.end, delta)
      : resizeBarDates(drag.start, drag.end, drag.mode === 'start' ? 'start' : 'end', delta)
    const el = scroller.current?.querySelector(`[data-bar-id="${drag.id}"]`) as HTMLElement | null
    if (!el) return
    el.style.transform = `translateX(${dayIndex(range.start, next.start) * width}px)`
    el.style.width = `${Math.max(1, dayIndex(next.start, next.end) + 1) * width}px`
    el.dataset.previewStart = next.start
    el.dataset.previewEnd = next.end
  }

  const finishDrag = () => {
    if (!drag || props.readOnly) { setDrag(null); return }
    const el = scroller.current?.querySelector(`[data-bar-id="${drag.id}"]`) as HTMLElement | null
    const start = el?.dataset.previewStart || drag.start
    const end = el?.dataset.previewEnd || drag.end
    setDrag(null)
    if (el) { el.style.transform = ''; el.style.width = '' }
    if (start !== drag.start || end !== drag.end) props.onDates?.(drag.id, start, end)
  }

  const headerLabel = (day: string, index: number) => {
    if (zoom === 'day') return formatDay(day).slice(0, 5)
    if (zoom === 'week') return index % 7 === 0 ? formatDay(day).slice(0, 5) : ''
    return day.endsWith('-01') ? formatDay(day).slice(3) : ''
  }

  return <div className={css.gantt} data-projects-gantt>
    <div className={css.ganttToolbar}>
      <div className={css.segment} role="radiogroup" aria-label="Масштаб Ганта" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {([['day', 'Дни'], ['week', 'Недели'], ['month', 'Месяцы']] as const).map(([id, name]) => (
          <button key={id} type="button" aria-pressed={zoom === id} onClick={() => setZoom(id)}>{name}</button>
        ))}
      </div>
      {!props.readOnly ? <p className={css.quiet}>{linkFrom ? 'Выберите задачу-последователя или нажмите ещё раз, чтобы отменить' : 'Потяните полосу, чтобы сдвинуть срок. Точки по краям — связь «финиш → старт».'}</p> : null}
    </div>
    <div className={css.ganttScroll} ref={scroller} onPointerMove={onPointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
      <div className={css.ganttInner} style={{ width: labelWidth + days.length * width }}>
        <div className={css.ganttHead} style={{ gridTemplateColumns: `${labelWidth}px repeat(${days.length}, ${width}px)` }}>
          <div className={css.ganttCorner}>Задача</div>
          {days.map((day, index) => <div key={day} className={css.ganttDay} data-today={day === today || undefined}>{headerLabel(day, index)}</div>)}
        </div>
        <div className={css.ganttBody} style={{ minHeight: Math.max(top.length, 1) * rowHeight }}>
          {todayOffset >= 0 ? <div className={css.ganttToday} style={{ left: labelWidth + todayOffset * width }} aria-hidden /> : null}
          <svg className={css.ganttArrows} width={labelWidth + days.length * width} height={Math.max(top.length, 1) * rowHeight}>
            {props.links.flatMap(link => {
              const fromBar = bars.find(bar => bar.id === link.fromId)
              const toBar = bars.find(bar => bar.id === link.toId)
              const fromIndex = top.findIndex(task => task.id === link.fromId)
              const toIndex = top.findIndex(task => task.id === link.toId)
              if (!fromBar || !toBar || fromIndex < 0 || toIndex < 0) return []
              const from = { x: labelWidth + (fromBar.dayOffset + fromBar.daySpan) * width, y: fromIndex * rowHeight + rowHeight / 2 }
              const to = { x: labelWidth + toBar.dayOffset * width, y: toIndex * rowHeight + rowHeight / 2 }
              return <path key={link.id} d={ganttArrowPath(from, to)} className={css.ganttArrow} markerEnd="url(#projects-gantt-arrow)" onClick={() => !props.readOnly && props.onUnlink?.(link.id)} />
            })}
            <defs>
              <marker id="projects-gantt-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
              </marker>
            </defs>
          </svg>
          {top.map((task, index) => {
            const bar = bars.find(item => item.id === task.id)
            return <div key={task.id} className={css.ganttRow} style={{ top: index * rowHeight, height: rowHeight }}>
              <button type="button" className={css.ganttLabel} style={{ width: labelWidth }} onClick={() => props.onOpenTask(task.id)}>
                <strong>{task.title}</strong>
                <span>{formatDay(task.due) || 'Без срока'}{task.estimate ? ` · ${formatMinutes(task.estimate)}` : ''}{task.spent ? ` / ${formatMinutes(task.spent)}` : ''}</span>
              </button>
              {bar ? <div
                className={css.ganttBar}
                data-bar-id={bar.id}
                data-done={bar.done || undefined}
                style={{ left: labelWidth + bar.dayOffset * width, width: bar.daySpan * width }}
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
                <span>{task.title}</span>
              </div> : <button type="button" className={css.ganttEmpty} style={{ left: labelWidth + 8 }} onClick={() => props.onOpenTask(task.id)}>Нет дат</button>}
            </div>
          })}
          {!top.length ? <p className={css.empty} style={{ padding: 16 }}>В проекте пока нет задач для Ганта.</p> : null}
        </div>
      </div>
    </div>
    {linkFrom && !props.readOnly ? <div className={css.ganttHint}><button type="button" className={buttons.secondary} onClick={() => setLinkFrom(null)}>Отменить связь</button></div> : null}
  </div>
}
