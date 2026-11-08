'use client'

import type { ProductionConfig } from '@tableapp/schema'
import { newId } from '@tableapp/schema'
import { useEffect, useRef, useState } from 'react'
import styles from './production-form.module.css'
import {
  previewConsumptionAction,
  type ConsumptionPreview,
  type MovementInput,
  type ProductionInput,
  type SavedMovement,
  type SavedProduction,
} from '@/app/production-actions'

/**
 * Ввод выпуска: предпросмотр расхода и сборка того, что уйдёт на сервер.
 *
 * Расход показывается **до** сохранения, и считает его сервер тем же кодом,
 * которым потом спишет. Посчитать в браузере было бы быстрее, но тогда формул
 * стало бы две, и однажды они разошлись бы: человек увидел бы на экране одно,
 * а в журнале склада другое. Такую ошибку не находят — с ней живут.
 */

/** Связь приходит массивом даже когда она одна. */
function one(value: unknown): string | null {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null
  return typeof value === 'string' && value !== '' ? value : null
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function runInputFrom(
  config: ProductionConfig,
  values: Record<string, unknown>,
  runId: string,
): ProductionInput {
  return {
    runId,
    productId: one(values[config.run.product]) ?? '',
    quantity: num(values[config.run.qty]),
    defects: num(values[config.run.defects]),
    date: text(values[config.run.date]) || null,
    shiftId: one(values[config.run.shift]),
    note: text(values[config.run.note]),
  }
}

export function movementInputFrom(
  config: ProductionConfig,
  values: Record<string, unknown>,
  movementId: string,
): MovementInput {
  return {
    movementId,
    materialId: one(values[config.movement.material]) ?? '',
    kindId: one(values[config.movement.kind]),
    amount: num(values[config.movement.qty]),
    date: text(values[config.movement.date]) || null,
    reason: text(values[config.movement.reason]),
  }
}

const decimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6 })

/** Что сказать человеку после сохранения: числами, а не «успешно». */
export function describeSaved(result: SavedProduction): string {
  if (result.repeated) {
    if (result.stockReceipt) return 'Этот выпуск уже сохранён — второй раз материалы не списывались и готовая продукция на склад не поступала.'
    return 'Этот выпуск уже сохранён — второй раз материалы не списывались.'
  }
  const receipt = result.stockReceipt ? ` На склад поступило ${decimal.format(result.stockReceipt.quantity)} шт.${result.stockReceipt.after !== undefined ? ` Остаток — ${decimal.format(result.stockReceipt.after)} шт.` : ''}` : ''
  const head = `Выпуск сохранён: ${result.product}, ${decimal.format(result.quantity)}.${receipt}`
  if (result.wrote.length === 0) {
    return `${head} Материалы не списаны: для этого изделия не задано ни одной действующей нормы.`
  }
  const list = result.wrote
    .map((line) => `${line.material} — ${decimal.format(line.amount)} ${line.unit}`.trim())
    .join(', ')
  return `${head} Списано: ${list.replace(/\.$/, '')}.`
}

export function describeMovement(result: SavedMovement): string {
  if (result.repeated) return 'Это движение уже записано — второй раз остаток не менялся.'
  const sign = result.amount > 0 ? 'Приход' : 'Списание'
  return `${sign}: ${result.material} ${decimal.format(Math.abs(result.amount))} ${result.unit}. Остаток — ${decimal.format(result.stock)} ${result.unit}.`.replace(
    /\s+/g,
    ' ',
  )
}

/** Новый идентификатор строки выпуска, живущий до успешного сохранения. */
export function useRowId(): { get: () => string; reset: () => void } {
  const ref = useRef<string | null>(null)
  return {
    get: () => {
      ref.current ??= newId('row')
      return ref.current
    },
    reset: () => {
      ref.current = null
    },
  }
}

type PreviewState = { lines: ConsumptionPreview['lines']; quantity: number } | null

/**
 * Расход по введённому количеству.
 *
 * С задержкой: человек набирает «20000» шестью нажатиями, и шесть запросов
 * подряд — это шесть чтений склада ради одного ответа.
 */
export function useConsumption(
  slug: string,
  config: ProductionConfig | null,
  values: Record<string, unknown>,
  enabled: boolean,
): { preview: PreviewState; loading: boolean } {
  const [preview, setPreview] = useState<PreviewState>(null)
  const [loading, setLoading] = useState(false)
  const productId = config ? one(values[config.run.product]) : null
  const quantity = config ? num(values[config.run.qty]) : 0
  // Номер запроса: ответ на устаревший ввод не должен затирать свежий.
  const seq = useRef(0)

  useEffect(() => {
    const mine = ++seq.current
    if (!enabled || !productId || quantity <= 0) {
      setPreview(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const result = await previewConsumptionAction(slug, productId, quantity)
        if (mine !== seq.current) return
        setLoading(false)
        setPreview(result.ok ? { lines: result.lines, quantity } : null)
      } catch { if (mine === seq.current) { setLoading(false); setPreview(null) } }
    }, 350)
    return () => { clearTimeout(timer); seq.current++ }
  }, [slug, productId, quantity, enabled])

  return { preview, loading }
}

/**
 * Что спишется.
 *
 * Нехватка показана, но не запрещает сохранить: настоящий склад расходится
 * с учётом — материал привезли и не записали, остаток поправят вечером.
 * Остановить смену из-за расхождения в таблице значит остановить дело ради
 * порядка в таблице.
 */
export function ConsumptionPanel({
  preview,
  loading,
}: {
  preview: PreviewState
  loading: boolean
}) {
  if (!preview && !loading) return null

  if (!preview) {
    return (
      <p className="rounded-xl border border-sand-200 bg-sand-50 px-4 py-3 text-sm text-ink-muted">
        Считаем расход…
      </p>
    )
  }

  if (preview.lines.length === 0) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Для этого изделия не задано ни одной действующей нормы — материалы списаны не будут.
      </p>
    )
  }

  const short = preview.lines.filter((line) => line.missing > 0)

  return (
    <div className={`${styles.panel} border-y border-sand-200 py-4`}>
      <p className="text-[13px] font-semibold text-ink-soft">
        Расход материалов
        {loading ? <span className="font-normal text-ink-muted"> — пересчитываем…</span> : null}
      </p>
      <div className={`${styles.grid} mt-3 grid items-baseline gap-x-3 gap-y-3 text-sm`}>
      <span className={`${styles.header} text-xs text-ink-muted`}>Материал</span><span className={`${styles.header} text-xs text-ink-muted`}>Спишется</span><span className={`${styles.header} text-xs text-ink-muted`}>Останется</span>
        {preview.lines.map((line) => (
          <div key={line.materialId} className="contents">
            <span className={`${styles.material} min-w-0 break-words text-ink-soft`}>{line.material}</span>
              <span className={`min-w-0 break-words text-right tabular-nums ${line.missing > 0 ? 'font-semibold text-amber-700' : 'font-medium'}`}>
                <span className={styles.mobileLabel}>Спишется</span>{decimal.format(line.need)} {line.unit}
              </span>
              <span className="min-w-0 break-words text-right tabular-nums text-ink-soft"><span className={styles.mobileLabel}>Останется</span>{decimal.format(line.stock-line.need)} {line.unit}</span>
          </div>
        ))}
      </div>
      {short.length > 0 ? (
        <p className="mt-3 border-t border-sand-200 pt-3 text-sm text-amber-900">
          На складе не хватает:{' '}
          {short
            .map((line) => `${line.material} — ${decimal.format(line.missing)} ${line.unit}`.trim())
            .join(', ')}
          . Сохранить всё равно можно: остаток в таблице мог отстать от склада.
        </p>
      ) : null}
    </div>
  )
}
