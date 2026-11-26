'use client'
import type { ReactNode } from 'react'
import { formatMoneyOrZero } from '@/lib/prokat-logic'
import type { DemoTodayTask } from '@/lib/prokat-today-demo'
import { ProtoIcon } from '../prototype/icons'
import css from './prokat-today.module.css'

export type TodayMetric = { key: string; label: string; value: number; bad?: boolean }

export type TodayExtra = {
  categories: readonly { name: string; percent: number }[]
  weeks: readonly { label: string; value: number }[]
}

function TaskRow(props: {
  task: DemoTodayTask
  solid?: boolean
  onOpen?: () => void
  onAction: () => void
}) {
  return <div className={css.tk} data-bad={props.solid || undefined}>
    <span className={`${css.tm} ${css.mono}`}>{props.task.stamp}</span>
    <button type="button" className={css.body} onClick={props.onOpen ?? props.onAction}>
      <b>{props.task.title}</b>
      <small>{props.task.detail}</small>
    </button>
    <button
      type="button"
      className={css.btn}
      data-o={props.solid ? undefined : ''}
      data-sm=""
      onClick={props.onAction}
    >{props.task.action}</button>
  </div>
}

export function TodayView(props: {
  subtitle: string
  metrics: readonly TodayMetric[]
  urgent: readonly DemoTodayTask[]
  agenda: readonly DemoTodayTask[]
  agendaHint: string
  emptyUrgent?: string
  emptyAgenda?: string
  phone: boolean
  extra?: TodayExtra | null
  onCreate?: () => void
  onOpen?: (task: DemoTodayTask) => void
  onAction: (task: DemoTodayTask) => void
}) {
  const maxWeek = Math.max(1, ...(props.extra?.weeks.map(week => week.value) ?? [1]))
  const create = props.onCreate ? <button type="button" className={css.btn} onClick={props.onCreate}>
    <ProtoIcon name="plus" size={16} />Новая бронь
  </button> : null

  return <div className={css.root} data-prokat-root data-prokat-screen="today" data-phone={props.phone || undefined}>
    <header className={css.top}>
      <div className={css.copy}>
        <h1 className={css.title}>Сегодня</h1>
        <p className={css.sub}>{props.subtitle}</p>
      </div>
      {create ? <div className={css.acts}>{create}</div> : null}
    </header>

    <div className={css.mk} role="group" aria-label="Показатели на сегодня">
      {props.metrics.map(metric => (
        <div key={metric.key}>
          <small>{metric.label}</small>
          <b data-bad={metric.bad || undefined} className={css.mono}>{metric.value}</b>
        </div>
      ))}
    </div>

    <div className={css.sec}>Срочно<small>{props.urgent.length}</small></div>
    {props.urgent.length
      ? props.urgent.map(task => (
        <TaskRow
          key={task.id}
          task={task}
          solid
          onOpen={props.onOpen ? () => props.onOpen?.(task) : undefined}
          onAction={() => props.onAction(task)}
        />
      ))
      : <p className={css.empty}>{props.emptyUrgent ?? 'Просрочек нет — всё вовремя.'}</p>}

    <div className={css.sec}>Выдать и принять<small>{props.agendaHint}</small></div>
    {props.agenda.length
      ? props.agenda.map(task => (
        <TaskRow
          key={task.id}
          task={task}
          onOpen={props.onOpen ? () => props.onOpen?.(task) : undefined}
          onAction={() => props.onAction(task)}
        />
      ))
      : <p className={css.empty}>{props.emptyAgenda ?? 'На сегодня выдач и возвратов нет.'}</p>}

    {props.extra && !props.phone ? <div className={css.extra} aria-label="Сводка парка">
      <div className={css.extraGrid}>
        <section className={css.block}>
          <h3>Загрузка по категориям</h3>
          {!props.extra.categories.length
            ? <p className={css.empty}>Добавьте предметы — здесь появится загрузка.</p>
            : props.extra.categories.map(row => (
              <div key={row.name} className={css.utilRow}>
                <div className={css.utilCopy}>
                  <strong>{row.name}</strong>
                  <span className={css.utilBar} aria-hidden="true"><i style={{ width: `${row.percent}%` }} /></span>
                </div>
                <span>{row.percent}%</span>
              </div>
            ))}
        </section>
        <section className={css.block}>
          <h3>Выручка по неделям</h3>
          <div className={css.revBars} role="img" aria-label="Выручка по неделям">
            {props.extra.weeks.map(week => {
              const pct = week.value ? Math.max(10, Math.round((week.value / maxWeek) * 100)) : 0
              return <div key={week.label} className={css.revBar}>
                <strong>{formatMoneyOrZero(week.value)}</strong>
                <div className={css.revChart}><span className={css.revFill} style={{ height: `${pct}%` }} /></div>
                <span>{week.label}</span>
              </div>
            })}
          </div>
        </section>
      </div>
    </div> : null as ReactNode}
  </div>
}
