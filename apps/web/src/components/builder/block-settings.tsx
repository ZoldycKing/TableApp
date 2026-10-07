'use client'

import type { Block, BlockSpan, Device, Field, Screen, View } from '@tableapp/schema'
import {
  emptyFilterGroup,
  KIND_NEEDS_FIELD,
  METRIC_KIND_NAMES,
  METRIC_KINDS,
  METRIC_RANGES,
  newId,
  RANGE_LABELS,
} from '@tableapp/schema'
import { useState } from 'react'
import type { RuntimeTable } from '@/lib/app-runtime'
import { ICON_NAMES } from '@/components/runtime/icons'
import { FilterBuilder } from '@/components/views/filter-builder'

/**
 * Настройки блока сводки.
 *
 * Плитка задаётся фразой, которую можно прочитать вслух: «показывать сумму
 * по колонке Стоимость за этот месяц, сравнивать с прошлым». Слов «агрегат»
 * и «период» здесь нет — на этом языке владелец небольшой фирмы настраивать
 * не станет.
 *
 * Редкое — отбор, сортировка, ширины — убрано под «Ещё»: форма из двадцати
 * полей отпугивает сильнее, чем отсутствие настройки.
 */

const INPUT =
  'w-full rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-sm outline-none focus:border-sage-400'
const LABEL = 'block text-xs font-medium text-[var(--color-ink-muted)]'

const DEVICE_NAMES: Record<Device, string> = {
  desktop: 'На широком экране',
  tablet: 'На планшете',
  mobile: 'На телефоне',
}

/** Ширины словами: «колонок из двенадцати» человеку ничего не говорит. */
const WIDTHS: { span: number; label: string }[] = [
  { span: 3, label: 'четверть' },
  { span: 4, label: 'треть' },
  { span: 6, label: 'половина' },
  { span: 8, label: 'две трети' },
  { span: 12, label: 'вся ширина' },
]

export function BlockSettings({
  block,
  views,
  runtimeTables,
  screens,
  onChange,
}: {
  block: Block
  views: View[]
  runtimeTables: Record<string, RuntimeTable>
  screens: Screen[]
  onChange: (block: Block) => void
}) {
  const [more, setMore] = useState(false)

  const source = 'source' in block ? block.source.viewId : null
  const view = views.find((item) => item.id === source)
  const fields: Field[] = view ? (runtimeTables[view.tableId]?.fields ?? []) : []

  const numbers = fields.filter((field) => field.type === 'number' || field.type === 'rollup')
  const dates = fields.filter((field) => field.type === 'date' || field.type === 'datetime')
  const choices = fields.filter((field) => field.type === 'single_select' || field.type === 'multi_select')

  const set = (patch: Record<string, unknown>) => onChange({ ...block, ...patch } as Block)
  const setSpan = (device: Device, value: number) =>
    set({ span: { ...block.span, [device]: value } satisfies BlockSpan })

  const head = (
    <>
      <label className="block space-y-1">
        <span className={LABEL}>Название</span>
        <input
          value={block.title}
          onChange={(event) => set({ title: event.target.value })}
          placeholder="Выручка за месяц"
          className={INPUT}
        />
      </label>

      <label className="block space-y-1">
        <span className={LABEL}>Пояснение под названием</span>
        <input
          value={block.description}
          onChange={(event) => set({ description: event.target.value })}
          placeholder="без учёта отменённых"
          className={INPUT}
        />
      </label>

      {'source' in block ? (
        <label className="block space-y-1">
          <span className={LABEL}>Откуда берём</span>
          <select
            value={block.source.viewId}
            onChange={(event) => set({ source: { viewId: event.target.value } })}
            className={INPUT}
          >
            <option value="">— не выбрано —</option>
            {views.map((item) => (
              <option key={item.id} value={item.id}>
                {runtimeTables[item.tableId]?.name ?? 'Таблица'} · {item.name}
              </option>
            ))}
          </select>
          <span className="block text-xs text-[var(--color-ink-muted)]">
            Отбор и сортировка представления действуют и здесь: блок считает ровно то, что видно
            в списке.
          </span>
        </label>
      ) : null}
    </>
  )

  /** Ширины и отбор: нужны редко, но нужны — прячем, а не выбрасываем. */
  const tail = (
    <div className="space-y-2 border-t border-[var(--color-border-subtle)] pt-2">
      <button
        type="button"
        onClick={() => setMore((value) => !value)}
        className="text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        {more ? 'Скрыть ширину и отбор' : 'Ещё: ширина, отбор, сортировка'}
      </button>

      {more ? (
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <span className={LABEL}>Сколько места занимает</span>
            {(['desktop', 'tablet', 'mobile'] as Device[]).map((device) => (
              <label key={device} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 text-[var(--color-ink-muted)]">{DEVICE_NAMES[device]}</span>
                <select
                  value={block.span[device]}
                  onChange={(event) => setSpan(device, Number(event.target.value))}
                  className="flex-1 rounded border border-[var(--color-border-subtle)] px-2 py-1 text-sm"
                >
                  {WIDTHS.map((width) => (
                    <option key={width.span} value={width.span}>
                      {width.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <p className="text-xs text-[var(--color-ink-muted)]">
              Ширина считается от места, где показано приложение, а не от размера монитора.
            </p>
          </div>

          {'source' in block ? (
            <>
              <div className="space-y-1">
                <span className={LABEL}>Свой отбор для этого блока</span>
                {block.filter ? (
                  <>
                    <FilterBuilder
                      fields={fields}
                      group={block.filter}
                      onChange={(group) => set({ filter: group })}
                      onRemove={() => set({ filter: null })}
                    />
                    <button
                      type="button"
                      onClick={() => set({ filter: null })}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Убрать отбор
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => set({ filter: emptyFilterGroup(newId('filter')) })}
                    className="rounded border border-[var(--color-border-subtle)] px-2 py-1 text-xs hover:bg-[var(--color-surface-muted)]"
                  >
                    + Условие
                  </button>
                )}
                <p className="text-xs text-[var(--color-ink-muted)]">
                  Отбор сужает то, что человеку и так видно. Открыть им чужие строки нельзя.
                </p>
              </div>

              <div className="space-y-1">
                <span className={LABEL}>Сортировка</span>
                {block.sorts.map((sort, index) => (
                  <div key={index} className="flex gap-1.5">
                    <select
                      value={sort.fieldId}
                      onChange={(event) =>
                        set({
                          sorts: block.sorts.map((one, at) =>
                            at === index ? { ...one, fieldId: event.target.value } : one,
                          ),
                        })
                      }
                      className={INPUT}
                    >
                      {fields.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sort.direction}
                      onChange={(event) =>
                        set({
                          sorts: block.sorts.map((one, at) =>
                            at === index ? { ...one, direction: event.target.value } : one,
                          ),
                        })
                      }
                      className="rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-xs"
                    >
                      <option value="asc">по возрастанию</option>
                      <option value="desc">по убыванию</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => set({ sorts: block.sorts.filter((_, at) => at !== index) })}
                      className="rounded border border-[var(--color-border-subtle)] px-2 text-xs text-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {fields.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      set({ sorts: [...block.sorts, { fieldId: fields[0]!.id, direction: 'desc' }] })
                    }
                    className="rounded border border-[var(--color-border-subtle)] px-2 py-1 text-xs hover:bg-[var(--color-surface-muted)]"
                  >
                    + Сортировка
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  if (block.type === 'metric') {
    return (
      <div className="space-y-2">
        {head}

        <label className="block space-y-1">
          <span className={LABEL}>Что показывать</span>
          <select value={block.kind} onChange={(event) => set({ kind: event.target.value })} className={INPUT}>
            {METRIC_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {METRIC_KIND_NAMES[kind]}
              </option>
            ))}
          </select>
        </label>

        {KIND_NEEDS_FIELD[block.kind] ? (
          <label className="block space-y-1">
            <span className={LABEL}>По какой колонке</span>
            <select
              value={block.fieldId ?? ''}
              onChange={(event) => set({ fieldId: event.target.value || null })}
              className={INPUT}
            >
              <option value="">— не выбрана —</option>
              {(block.kind === 'count_filled' ? fields : numbers).map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block space-y-1">
          <span className={LABEL}>За какой срок</span>
          <select value={block.range} onChange={(event) => set({ range: event.target.value })} className={INPUT}>
            {METRIC_RANGES.map((range) => (
              <option key={range} value={range}>
                {RANGE_LABELS[range]}
              </option>
            ))}
          </select>
        </label>

        {block.range !== 'all' ? (
          <>
            <label className="block space-y-1">
              <span className={LABEL}>По какой дате считать срок</span>
              <select
                value={block.dateFieldId ?? ''}
                onChange={(event) => set({ dateFieldId: event.target.value || null })}
                className={INPUT}
              >
                <option value="">— не выбрана, срок не применится —</option>
                {dates.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={block.compare}
                onChange={(event) => set({ compare: event.target.checked })}
              />
              Сравнивать с предыдущим таким же сроком
            </label>
          </>
        ) : null}

        <label className="block space-y-1">
          <span className={LABEL}>Как показать число</span>
          <select value={block.format} onChange={(event) => set({ format: event.target.value })} className={INPUT}>
            <option value="auto">как в таблице</option>
            <option value="plain">просто число</option>
            <option value="currency">рубли</option>
            <option value="percent">проценты</option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className={LABEL}>Значок</span>
          <select value={block.icon} onChange={(event) => set({ icon: event.target.value })} className={INPUT}>
            {ICON_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        {tail}
      </div>
    )
  }

  if (block.type === 'list') {
    const pick = (label: string, value: string | null, key: string) => (
      <label className="block space-y-1">
        <span className={LABEL}>{label}</span>
        <select
          value={value ?? ''}
          onChange={(event) => set({ [key]: event.target.value || null })}
          className={INPUT}
        >
          <option value="">— не показывать —</option>
          {fields.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </select>
      </label>
    )

    return (
      <div className="space-y-2">
        {head}
        {pick('Заголовок строки', block.titleFieldId, 'titleFieldId')}
        {pick('Подпись', block.subtitleFieldId, 'subtitleFieldId')}
        {pick('Значение справа', block.metaFieldId, 'metaFieldId')}

        <label className="block space-y-1">
          <span className={LABEL}>Сколько строк</span>
          <input
            type="number"
            min={1}
            max={20}
            value={block.limit}
            onChange={(event) => set({ limit: Math.max(1, Math.min(20, Number(event.target.value) || 5)) })}
            className={INPUT}
          />
        </label>

        <ScreenPick label="По нажатию открывать" value={block.onTapScreenId} screens={screens} onPick={(id) => set({ onTapScreenId: id })} />
        <ScreenPick label="Куда ведёт «Все»" value={block.moreScreenId} screens={screens} onPick={(id) => set({ moreScreenId: id })} />
        {tail}
      </div>
    )
  }

  if (block.type === 'pipeline') {
    return (
      <div className="space-y-2">
        {head}
        <label className="block space-y-1">
          <span className={LABEL}>Считать по колонке</span>
          <select
            value={block.stackFieldId ?? ''}
            onChange={(event) => set({ stackFieldId: event.target.value || null })}
            className={INPUT}
          >
            <option value="">— не выбрана —</option>
            {choices.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
          <span className="block text-xs text-[var(--color-ink-muted)]">
            Подходит колонка выбора: её варианты и станут строками доски.
          </span>
        </label>

        <label className="block space-y-1">
          <span className={LABEL}>Показывать записи в колонках</span>
          <select
            value={block.cardLimit}
            onChange={(event) => set({ cardLimit: Number(event.target.value) })}
            className={INPUT}
          >
            <option value={0}>только количество</option>
            <option value={3}>плюс три записи</option>
            <option value={5}>плюс пять записей</option>
          </select>
        </label>

        {block.cardLimit > 0 ? (
          <label className="block space-y-1">
            <span className={LABEL}>Чем подписывать записи</span>
            <select
              value={block.cardTitleFieldId ?? ''}
              onChange={(event) => set({ cardTitleFieldId: event.target.value || null })}
              className={INPUT}
            >
              <option value="">— не выбрана —</option>
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <ScreenPick label="По нажатию открывать" value={block.onTapScreenId} screens={screens} onPick={(id) => set({ onTapScreenId: id })} />
        {tail}
      </div>
    )
  }

  if (block.type === 'actions') {
    return (
      <div className="space-y-2">
        {head}
        <span className={LABEL}>Кнопки</span>
        {block.items.map((item, index) => {
          const patchItem = (patch: Record<string, unknown>) =>
            set({ items: block.items.map((one, at) => (at === index ? { ...one, ...patch } : one)) })

          return (
            <div key={item.id} className="space-y-1 rounded-lg border border-[var(--color-border-subtle)] p-2">
              <div className="flex gap-1.5">
                <input
                  value={item.label}
                  onChange={(event) => patchItem({ label: event.target.value })}
                  className={INPUT}
                />
                <button
                  type="button"
                  onClick={() => set({ items: block.items.filter((_, at) => at !== index) })}
                  className="rounded border border-[var(--color-border-subtle)] px-2 text-xs text-red-600"
                >
                  ×
                </button>
              </div>

              <select
                value={item.url ? '__url' : item.screenId}
                onChange={(event) =>
                  event.target.value === '__url'
                    ? patchItem({ screenId: '', url: 'https://' })
                    : patchItem({ screenId: event.target.value, url: '' })
                }
                className={INPUT}
              >
                <option value="">— куда ведёт —</option>
                {screens.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
                <option value="__url">по адресу в интернете</option>
              </select>

              {item.url ? (
                <input
                  value={item.url}
                  onChange={(event) => patchItem({ url: event.target.value })}
                  placeholder="https://"
                  className={INPUT}
                />
              ) : null}

              <select
                value={item.icon}
                onChange={(event) => patchItem({ icon: event.target.value })}
                className={INPUT}
              >
                {ICON_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
        <button
          type="button"
          onClick={() =>
            set({
              items: [
                ...block.items,
                {
                  id: newId('component'),
                  label: 'Действие',
                  icon: 'plus',
                  screenId: screens[0]?.id ?? '',
                  url: '',
                },
              ],
            })
          }
          className="rounded border border-[var(--color-border-subtle)] px-2 py-1 text-xs hover:bg-[var(--color-surface-muted)]"
        >
          + Кнопка
        </button>
        {tail}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {head}
      <label className="block space-y-1">
        <span className={LABEL}>Текст</span>
        <textarea
          rows={3}
          value={block.text}
          onChange={(event) => set({ text: event.target.value })}
          className={INPUT}
        />
      </label>
      <label className="block space-y-1">
        <span className={LABEL}>Вид</span>
        <select value={block.style} onChange={(event) => set({ style: event.target.value })} className={INPUT}>
          <option value="plain">обычная</option>
          <option value="info">пояснение</option>
          <option value="warning">предупреждение</option>
        </select>
      </label>
      {tail}
    </div>
  )
}

function ScreenPick({
  label,
  value,
  screens,
  onPick,
}: {
  label: string
  value: string | null
  screens: Screen[]
  onPick: (id: string | null) => void
}) {
  return (
    <label className="block space-y-1">
      <span className={LABEL}>{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onPick(event.target.value || null)}
        className={INPUT}
      >
        <option value="">— никуда —</option>
        {screens.map((screen) => (
          <option key={screen.id} value={screen.id}>
            {screen.name}
          </option>
        ))}
      </select>
    </label>
  )
}
