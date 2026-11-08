'use client'

import {
  graceReserve,
  graceUsed,
  isOverLimit,
  nextPlan,
  usageLevel,
  usageRatio,
  type Plan,
  type UsageLevel,
} from '@tableapp/schema'
import { useState, useTransition } from 'react'
import { recountUsageAction } from '@/app/usage-actions'

/**
 * Страница расхода.
 *
 * Отвечает на два вопроса и ровно в таком порядке: сколько я уже трачу
 * и что будет, когда кончится. Первый — цифрами, второй — следующим тарифом
 * внизу. Всё остальное на этой странице лишнее.
 *
 * Строки идут первыми не случайно: это единственный показатель, который
 * растёт сам по себе, пока люди просто работают. Число пользователей стоит
 * отдельно и без полосы — за него не берут денег, и рисовать ему потолок
 * значило бы намекнуть на обратное.
 */

export type UsageNumbers = {
  rows: number
  tables: number
  publishedApps: number
  fileBytes: number
  appUsers: number
  countedAt: string
}

export type TableRow = { id: string; name: string; rows: number }

const TONE: Record<UsageLevel, { bar: string; text: string; note: string | null }> = {
  ok: { bar: 'bg-sage-500', text: 'text-[var(--color-ink-muted)]', note: null },
  notice: {
    bar: 'bg-sage-500',
    text: 'text-[var(--color-ink-muted)]',
    note: 'Израсходовано больше двух третей.',
  },
  warning: {
    bar: 'bg-amber-500',
    text: 'text-amber-900',
    note: 'Лимит почти использован. Проверьте, хватит ли его для новых данных.',
  },
  reached: {
    bar: 'bg-sage-600',
    text: 'text-sage-700',
    // Точная формулировка: добавлять нельзя, но ничего из созданного
    // не выключено. Второе человек должен услышать в той же фразе,
    // иначе первое читается как «всё встало».
    note: 'Лимит использован. Существующие данные остаются доступны.',
  },
}

/** Числа по-русски: тысячи разделяем, иначе «18420» читается как дата. */
function count(value: number): string {
  return value.toLocaleString('ru-RU')
}

/**
 * Склонение после числа.
 *
 * «2 приложений» — это не опечатка, которую не замечают: это первое, обо что
 * спотыкается глаз, и продукт сразу выглядит переведённым с чужого языка.
 * Правило русское: 1 — первая форма, 2–4 — вторая, остальное — третья,
 * кроме одиннадцати–четырнадцати.
 */
function plural(value: number, one: string, few: string, many: string): string {
  const tens = Math.abs(value) % 100
  if (tens >= 11 && tens <= 14) return many
  const ones = tens % 10
  if (ones === 1) return one
  if (ones >= 2 && ones <= 4) return few
  return many
}

/**
 * Размер файлов словами человека.
 *
 * Показываем в тех же единицах, что и потолок: «1,2 из 3 ГБ» читается,
 * а «1288490188 из 3221225472» — нет.
 */
export function bytes(value: number): string {
  const GB = 1024 ** 3
  const MB = 1024 ** 2
  if (value >= GB) return `${(value / GB).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ГБ`
  if (value >= MB) return `${Math.round(value / MB).toLocaleString('ru-RU')} МБ`
  if (value >= 1024) return `${Math.round(value / 1024).toLocaleString('ru-RU')} КБ`
  return `${count(value)} Б`
}

function Meter({
  label,
  used,
  limit,
  format = count,
  reachedMessage,
}: {
  label: string
  used: number
  limit: number
  format?: (value: number) => string
  reachedMessage?: string
}) {
  const level = usageLevel(used, limit)
  const tone = TONE[level]
  const percent = Math.round(usageRatio(used, limit) * 100)

  return (
    <li className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium">{label}</span>
        <span className={`text-sm tabular-nums ${tone.text}`}>
          <span className="font-semibold text-[var(--color-ink)]">{format(used)}</span>
          {' из '}
          {format(limit)}
          <span className="ml-2 text-xs">{percent}%</span>
        </span>
      </div>

      <div
        className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]"
        role="progressbar"
        aria-valuenow={Math.min(percent, 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        aria-valuetext={`${format(used)} из ${format(limit)}`}
      >
        {/* Полоса не уходит за край, даже когда израсходовано больше потолка:
            иначе «120%» рисуется как «ровно столько же», и разницы не видно. */}
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>

      {tone.note ? <p className={`text-xs leading-4 ${tone.text}`}>{level === 'reached' ? reachedMessage ?? tone.note : tone.note}</p> : null}
    </li>
  )
}

/**
 * Аварийный резерв.
 *
 * Отдельная полоса, а не продолжение основной: это не «ещё немного места»,
 * а запас на время, пока владелец решает вопрос. Красная с самого начала —
 * потому что тратится он уже за потолком.
 */
function Reserve({ used, limit }: { used: number; limit: number }) {
  const percent = Math.round(usageRatio(used, limit) * 100)

  return (
    <li className="space-y-1.5 rounded-xl bg-amber-50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium text-amber-900">Аварийный резерв</span>
        <span className="text-sm tabular-nums text-amber-900">
          <span className="font-semibold">{count(used)}</span>
          {' из '}
          {count(limit)}
          <span className="ml-2 text-xs">{percent}%</span>
        </span>
      </div>

      <div
        className="h-2 overflow-hidden rounded-full bg-amber-200"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Аварийный резерв строк"
      >
        <div className="h-full rounded-full bg-amber-600" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>

      <p className="text-xs text-amber-900">
        Тратится только заказами из приложения. Вручную и импортом его не пополнить и не потратить.
      </p>
    </li>
  )
}

export function UsageReport({
  plan,
  usage,
  byTable,
  canRecount,
}: {
  plan: Plan
  usage: UsageNumbers
  byTable: TableRow[]
  /** Пересчёт вручную — владельцу: это его пространство и его счёт. */
  canRecount: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [recounted, setRecounted] = useState<string | null>(null)
  const upgrade = nextPlan(plan.id)
  const reserveSize = graceReserve(plan.limits.rows)
  const reserveUsed = graceUsed(usage.rows, plan.limits.rows)
  const over = isOverLimit(usage.rows, plan.limits.rows)
  const biggest = byTable.filter((table) => table.rows > 0).slice(0, 8)

  return (
    <div className="space-y-8">
      {/*
        Превышение — событие, а не оттенок полосы. Владелец должен узнать
        о нём сразу и целой фразой: с этого момента его собственный ввод
        остановлен, а заказы клиентов идут на аварийном резерве.
      */}
      {over ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">Строки закончились</h2>
          <p className="mt-1 text-sm leading-relaxed text-amber-900">
            Добавлять строки вручную и загружать файлы с данными сейчас нельзя.
            Заказы, которые оформляют ваши клиенты в приложении, продолжают приниматься
            из аварийного резерва — {count(reserveUsed)} из {count(reserveSize)}.
            Когда он кончится, перестанут приниматься и они.
          </p>
          <p className="mt-2 text-sm text-amber-900">
            Ничего из созданного не отключено: записи, приложения и файлы на месте,
            их можно смотреть, править, удалять и выгружать.
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[var(--color-border-subtle)] p-5">
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Тариф «{plan.name}»</h2>
          <span className="text-sm text-[var(--color-ink-muted)]">
            {plan.monthlyPrice === 0 ? 'бесплатно' : `${count(plan.monthlyPrice)} ₽ в месяц`}
          </span>
        </header>

        <ul className="space-y-4">
          <Meter label="Строки" used={usage.rows} limit={plan.limits.rows} reachedMessage="Лимит строк использован. Чтобы добавить новые, освободите место или обсудите другой тариф. Существующие записи доступны." />
          {/*
            Резерв показываем только после того, как основной потолок пройден.
            До этого он — внутреннее устройство, и рисовать вторую полосу
            рядом с непочатой первой значит предлагать человеку разбираться
            в том, что его пока не касается.
          */}
          {over ? <Reserve used={reserveUsed} limit={reserveSize} /> : null}
          <Meter label="Файлы" used={usage.fileBytes} limit={plan.limits.fileBytes} format={bytes} reachedMessage="Место для новых файлов использовано. Загруженные файлы остаются доступны." />
          <Meter
            label="Опубликованные приложения"
            used={usage.publishedApps}
            limit={plan.limits.publishedApps}
            reachedMessage={`Опубликовано ${usage.publishedApps} из ${plan.limits.publishedApps}. Для следующего приложения нужен другой тариф. Текущие приложения продолжают работать.`}
          />
          <Meter label="Таблицы" used={usage.tables} limit={plan.limits.tables} reachedMessage="Лимит таблиц использован. Существующие таблицы доступны, новые можно создать после освобождения места или смены тарифа." />
        </ul>

        {/*
         * Пользователи — отдельно и без полосы. Полоса означает потолок,
         * а потолка тут нет: платить за каждого сотрудника — ровно то,
         * из-за чего малый бизнес уходит от зарубежных сервисов.
         */}
        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-[var(--color-border-subtle)] pt-4">
          <span className="text-sm font-medium">Пользователи приложений</span>
          <span className="text-sm tabular-nums">
            <span className="font-semibold">{count(usage.appUsers)}</span>
            <span className="ml-2 text-xs text-[var(--color-ink-muted)]">
              не влияют на стоимость
            </span>
          </span>
        </div>
      </section>

      {biggest.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Больше всего данных</h2>
          <ul className="divide-y divide-[var(--color-border-subtle)] rounded-2xl border border-[var(--color-border-subtle)]">
            {biggest.map((table) => (
              <li key={table.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <span className="truncate text-sm">{table.name}</span>
                <span className="shrink-0 text-sm tabular-nums text-[var(--color-ink-muted)]">
                  {count(table.rows)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            Считаются только ваши строки. Служебные записи — журнал изменений, сессии,
            история входов — в расход не входят.
          </p>
        </section>
      ) : null}

      {upgrade ? (
        <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] p-5">
          <h2 className="text-sm font-semibold">Следующий тариф — «{upgrade.name}»</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{upgrade.fit}</p>
          <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            <li>
              {count(upgrade.limits.rows)}{' '}
              {plural(upgrade.limits.rows, 'строка', 'строки', 'строк')}
            </li>
            <li>{bytes(upgrade.limits.fileBytes)} файлов</li>
            <li>
              {upgrade.limits.publishedApps}{' '}
              {plural(upgrade.limits.publishedApps, 'приложение', 'приложения', 'приложений')}
            </li>
            <li>
              {upgrade.limits.tables}{' '}
              {plural(upgrade.limits.tables, 'таблица', 'таблицы', 'таблиц')}
            </li>
          </ul>
          <p className="mt-3 text-sm">
            <span className="font-semibold">
              {upgrade.monthlyPrice === 0 ? 'бесплатно' : `${count(upgrade.monthlyPrice)} ₽ в месяц`}
            </span>
            <span className="ml-2 text-xs text-[var(--color-ink-muted)]">
              цена ориентировочная, оплата пока не подключена
            </span>
          </p>
        </section>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--color-ink-muted)]">
        <span>
          {recounted ?? `Посчитано ${new Date(usage.countedAt).toLocaleString('ru-RU')}`}
        </span>
        {canRecount ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await recountUsageAction()
                setRecounted(
                  result.ok
                    ? `Пересчитано ${new Date().toLocaleString('ru-RU')}`
                    : 'Пересчитать не удалось',
                )
              })
            }
            className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)] disabled:opacity-40"
          >
            {pending ? 'Считаем…' : 'Пересчитать'}
          </button>
        ) : null}
      </footer>
    </div>
  )
}
