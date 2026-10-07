'use client'

import type { App, Field, Screen, View } from '@tableapp/schema'
import type { TableSummary } from '@/lib/queries'
import { ScreenAccessFields } from './screen-access'

const INPUT =
  'w-full rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-sm outline-none focus:border-sage-400'
const LABEL = 'block text-xs font-medium text-[var(--color-ink-muted)]'

export function ScreenSettings({
  app,
  screen,
  screens,
  tables,
  views,
  fields,
  onChange,
}: {
  app: App
  screen: Screen
  screens: Screen[]
  tables: TableSummary[]
  views: View[]
  fields: Field[]
  onChange: (screen: Screen) => void
}) {
  const others = screens.filter((candidate) => candidate.id !== screen.id)

  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className={LABEL}>Название экрана</span>
        <input
          value={screen.name}
          onChange={(event) => onChange({ ...screen, name: event.target.value })}
          className={INPUT}
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={screen.tab !== null}
          onChange={(event) =>
            onChange({
              ...screen,
              tab: event.target.checked ? { icon: 'list', label: screen.name.slice(0, 30) } : null,
            })
          }
        />
        Показывать во вкладках внизу
      </label>

      {screen.tab ? (
        <label className="block space-y-1">
          <span className={LABEL}>Подпись вкладки</span>
          <input
            value={screen.tab.label}
            onChange={(event) =>
              onChange({ ...screen, tab: { icon: screen.tab!.icon, label: event.target.value } })
            }
            className={INPUT}
          />
        </label>
      ) : null}

      <ScreenAccessFields
        app={app}
        screen={screen}
        views={views}
        fieldsByTable={Object.fromEntries(tables.map((table) => [table.id, table.fields]))}
        onChange={onChange}
      />

      {screen.type === 'list' || screen.type === 'tiles' ? (
        <>
          <label className="block space-y-1">
            <span className={LABEL}>Источник — представление</span>
            <select
              value={screen.source.viewId}
              onChange={(event) =>
                onChange({ ...screen, source: { ...screen.source, viewId: event.target.value } })
              }
              className={INPUT}
            >
              {views.map((view) => {
                const table = tables.find((candidate) => candidate.id === view.tableId)
                return (
                  <option key={view.id} value={view.id}>
                    {table?.name} · {view.name}
                  </option>
                )
              })}
            </select>
            <span className="block text-xs text-[var(--color-ink-muted)]">
              Фильтры и сортировка представления действуют и здесь.
            </span>
          </label>

          <label className="block space-y-1">
            <span className={LABEL}>Заголовок строки</span>
            <select
              value={screen.titleFieldId ?? ''}
              onChange={(event) => onChange({ ...screen, titleFieldId: event.target.value || null })}
              className={INPUT}
            >
              <option value="">— не выбрано —</option>
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className={LABEL}>Подзаголовок</span>
            <select
              value={screen.subtitleFieldId ?? ''}
              onChange={(event) => onChange({ ...screen, subtitleFieldId: event.target.value || null })}
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

          <label className="block space-y-1">
            <span className={LABEL}>Статус</span>
            <select
              value={screen.statusFieldId ?? ''}
              onChange={(event) => onChange({ ...screen, statusFieldId: event.target.value || null })}
              className={INPUT}
            >
              <option value="">— не показывать —</option>
              {fields
                .filter((field) => field.type === 'single_select' || field.type === 'multi_select')
                .map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.name}
                  </option>
                ))}
            </select>
            <span className="block text-xs text-[var(--color-ink-muted)]">
              Плашка в строке и вкладки над списком. Подходит колонка выбора: её варианты
              и станут вкладками.
            </span>
          </label>

          <label className="block space-y-1">
            <span className={LABEL}>Картинка</span>
            <select
              value={screen.imageFieldId ?? ''}
              onChange={(event) => onChange({ ...screen, imageFieldId: event.target.value || null })}
              className={INPUT}
            >
              <option value="">— без картинки —</option>
              {/* Только поля с файлами: текст картинкой не станет. */}
              {fields
                .filter((field) => field.type === 'image' || field.type === 'attachment')
                .map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className={LABEL}>Значение справа</span>
            <select
              value={screen.metaFieldId ?? ''}
              onChange={(event) => onChange({ ...screen, metaFieldId: event.target.value || null })}
              className={INPUT}
            >
              <option value="">— не показывать —</option>
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
            <span className="block text-xs text-[var(--color-ink-muted)]">
              Цена, остаток или срок — то, ради чего смотрят в список.
            </span>
          </label>

          <label className="block space-y-1">
            <span className={LABEL}>По нажатию открывать</span>
            <select
              value={screen.onTapScreenId ?? ''}
              onChange={(event) => onChange({ ...screen, onTapScreenId: event.target.value || null })}
              className={INPUT}
            >
              <option value="">ничего</option>
              {others.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      {screen.type === 'detail' || screen.type === 'form' ? (
        <label className="block space-y-1">
          <span className={LABEL}>Таблица</span>
          <select
            value={screen.tableId}
            onChange={(event) => onChange({ ...screen, tableId: event.target.value })}
            className={INPUT}
          >
            {tables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {screen.type === 'form' ? (
        <>
          <label className="block space-y-1">
            <span className={LABEL}>Режим</span>
            <select
              value={screen.mode}
              onChange={(event) =>
                onChange({ ...screen, mode: event.target.value as 'create' | 'edit' })
              }
              className={INPUT}
            >
              <option value="create">создание записи</option>
              <option value="edit">редактирование</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className={LABEL}>Надпись на кнопке</span>
            <input
              value={screen.submitLabel}
              onChange={(event) => onChange({ ...screen, submitLabel: event.target.value })}
              className={INPUT}
            />
          </label>
          <label className="block space-y-1">
            <span className={LABEL}>После сохранения открыть</span>
            <select
              value={screen.successScreenId ?? ''}
              onChange={(event) => onChange({ ...screen, successScreenId: event.target.value || null })}
              className={INPUT}
            >
              <option value="">вернуться назад</option>
              {others.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
    </div>
  )
}
