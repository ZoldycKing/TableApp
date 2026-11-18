'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { APP_TIME_ZONE } from '@tableapp/schema'
import { queueStockCheckAction, saveStockScheduleAction, setStockScheduleActiveAction } from '@/app/stock-automation-actions'
import { STOCK_AUTOMATION_ZONES } from '@/lib/stock-automation-time'
import { ownerInput, ownerPrimary, ownerSecondary, OwnerField } from './owner-ui'

type Run = {
  id: string; trigger: 'schedule' | 'manual'; status: 'queued' | 'succeeded' | 'failed' | 'cancelled';
  time: string; checked: number; createdTasks: number; attempts: number; error: string | null;
}

function runStatus(run: Run) {
  switch (run.status) {
    case 'succeeded': return 'Завершена'
    case 'failed': return 'Ошибка'
    case 'cancelled': return 'Отменена'
    default: return run.attempts ? 'Ожидает повтора' : 'В очереди'
  }
}

export function StockAutomationPanel({ appId, itemTableId, columns, settings, taskTable, runs }: {
  appId: string; itemTableId: string | null; columns: { id: string; name: string }[];
  settings?: { minimumFieldId: string; localTime: string; timeZone: string; nextRunAt: string | null };
  taskTable?: { id: string; name: string }; runs: Run[];
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>()
  const waiting = runs.some(run => run.status === 'queued')
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => router.refresh(), 4000)
    return () => clearInterval(timer)
  }, [waiting, router])

  const send = (action: () => ReturnType<typeof queueStockCheckAction>, message: string) => {
    if (pending) return
    setFeedback(undefined)
    startTransition(async () => {
      try {
        const result = await action()
        setFeedback(result.ok ? { error: false, text: message } : { error: true, text: result.error })
        if (result.ok) router.refresh()
      } catch {
        setFeedback({ error: true, text: 'Связь с сервером прервалась. Попробуйте ещё раз.' })
      }
    })
  }

  const minimum = settings?.minimumFieldId ?? columns.find(column => column.name === 'Минимальный остаток')?.id ?? ''
  const validMinimum = columns.some(column => column.id === minimum)
  const canRun = Boolean(itemTableId && taskTable && validMinimum)
  return <div className="space-y-6">
    <section aria-labelledby="stock-check-title" className="rounded-2xl border border-sand-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="stock-check-title" className="text-lg font-semibold">Ежедневная проверка остатков</h2>
        {settings && <span className="rounded-full bg-sand-100 px-3 py-1 text-xs text-ink-soft">{settings.nextRunAt ? 'По расписанию' : 'На паузе'}</span>}
      </div>
      <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">Если остаток равен минимуму или ниже, Scatta создаёт задачу на закупку. Пока задача по товару открыта, новая не появится.</p>
      {!itemTableId && <p className="mt-4 text-sm text-ink-soft">Чтобы настроить или запустить проверку, опубликуйте приложение со складом.</p>}
      {itemTableId && !columns.length && <p className="mt-4 text-sm text-ink-soft">Добавьте числовое поле с минимальным остатком в таблицу товаров. <Link href={`/t/${encodeURIComponent(itemTableId)}`} className="underline underline-offset-4">Открыть таблицу товаров</Link></p>}
      {itemTableId && columns.length > 0 && <form className="mt-5 space-y-4" onSubmit={event => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        send(() => saveStockScheduleAction(appId, data), settings ? 'Расписание сохранено.' : 'Ежедневная проверка включена.')
      }}>
        <fieldset key={`${settings?.minimumFieldId}/${settings?.localTime}/${settings?.timeZone}`} disabled={pending} className="grid gap-3 sm:grid-cols-3">
          <OwnerField label="Поле с минимумом"><select className={`${ownerInput} mt-1 w-full`} name="minimum" defaultValue={validMinimum ? minimum : ''} required>
            <option value="" disabled>Выберите поле</option>
            {columns.map(column => <option key={column.id} value={column.id}>{column.name}</option>)}
          </select></OwnerField>
          <OwnerField label="Время проверки"><input className={`${ownerInput} mt-1 w-full`} name="time" type="time" defaultValue={settings?.localTime ?? '09:00'} required /></OwnerField>
          <OwnerField label="Часовой пояс"><select className={`${ownerInput} mt-1 w-full`} name="zone" defaultValue={settings?.timeZone ?? APP_TIME_ZONE}>
            {STOCK_AUTOMATION_ZONES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></OwnerField>
        </fieldset>
        {!settings && <p className="text-sm text-ink-soft">Для результатов появится таблица «Задачи на закупку».</p>}
        <button type="submit" className={ownerPrimary} disabled={pending}>{settings ? 'Сохранить расписание' : 'Включить проверку'}</button>
      </form>}
      {settings && <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-sand-200 pt-4">
        {settings.nextRunAt && <p className="w-full text-sm text-ink-soft">Следующая проверка — {settings.nextRunAt}</p>}
        <button type="button" className={ownerSecondary} disabled={pending || (!settings.nextRunAt && !canRun)} onClick={() => {
          const enable = !settings.nextRunAt
          send(() => setStockScheduleActiveAction(appId, enable), enable ? 'Расписание включено.' : 'Расписание на паузе.')
        }}>{settings.nextRunAt ? 'Поставить на паузу' : 'Возобновить расписание'}</button>
        <button type="button" className={ownerSecondary} disabled={pending || !canRun} onClick={() => send(() => queueStockCheckAction(appId), 'Проверка поставлена в очередь.')}>Проверить сейчас</button>
        {taskTable && <Link href={`/t/${encodeURIComponent(taskTable.id)}`} className="text-sm font-medium text-sage-700 underline underline-offset-4">Открыть задачи</Link>}
      </div>}
      {feedback && <p className={`mt-4 text-sm ${feedback.error ? 'text-red-700' : 'text-sage-700'}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    </section>
    {settings && <section aria-labelledby="stock-history-title" className="rounded-2xl border border-sand-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="stock-history-title" className="text-lg font-semibold">История проверок</h2>
        {runs.length > 0 && <button className={ownerSecondary} type="button" disabled={pending} onClick={() => router.refresh()}>Обновить</button>}
      </div>
      {runs.length === 0 ? <p className="mt-2 text-sm text-ink-soft">Здесь появится результат первой проверки.</p> : <ol className="mt-4 divide-y divide-sand-200">
        {runs.map(run => <li key={run.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{run.time} <span className="font-normal text-ink-soft">· {run.trigger === 'manual' ? 'Вручную' : 'По расписанию'}</span></p>
            {run.status === 'succeeded' && <p className="mt-1 text-ink-soft">Товаров проверено — {run.checked}. Новых задач — {run.createdTasks}.</p>}
            {run.error && <p className="mt-1 text-red-700">{run.error}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sand-100 px-3 py-1 text-xs text-ink-soft">{runStatus(run)}</span>
            {run.status === 'failed' && <button className={ownerSecondary} type="button" disabled={pending || !canRun} onClick={() => send(() => queueStockCheckAction(appId, run.id), 'Повтор поставлен в очередь.')}>Повторить</button>}
          </div>
        </li>)}
      </ol>}
    </section>}
  </div>
}
