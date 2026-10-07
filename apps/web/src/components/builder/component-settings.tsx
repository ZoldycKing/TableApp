'use client'

import type { Action, Component, Field, Screen } from '@tableapp/schema'
import { newId } from '@tableapp/schema'
import { BindingEditor } from './binding-editor'

const INPUT =
  'w-full rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-sm outline-none focus:border-sage-400'
const LABEL = 'block text-xs font-medium text-[var(--color-ink-muted)]'

export const COMPONENT_LABELS: Record<Component['type'], string> = {
  heading: 'Заголовок',
  text: 'Текст',
  image: 'Изображение',
  field: 'Поле',
  button: 'Кнопка',
  divider: 'Разделитель',
  related_list: 'Связанный список',
  gallery: 'Галерея',
  form_field: 'Поле формы',
  card: 'Карточка',
}

const ACTION_LABELS: Record<Action['type'], string> = {
  open_screen: 'Открыть экран',
  create_row: 'Создать запись',
  update_row: 'Изменить запись',
  delete_row: 'Удалить запись',
  open_url: 'Открыть ссылку',
  call_phone: 'Позвонить',
  send_email: 'Написать письмо',
  go_back: 'Назад',
}

function FieldPicker({
  label,
  value,
  fields,
  onChange,
  allowEmpty,
}: {
  label: string
  value: string | null
  fields: Field[]
  onChange: (fieldId: string) => void
  allowEmpty?: boolean
}) {
  return (
    <label className="block space-y-1">
      <span className={LABEL}>{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)} className={INPUT}>
        {allowEmpty ? <option value="">— не выбрано —</option> : null}
        {fields.map((field) => (
          <option key={field.id} value={field.id}>
            {field.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function ActionEditor({
  action,
  screens,
  fields,
  tableId,
  onChange,
}: {
  action: Action
  screens: Screen[]
  fields: Field[]
  tableId: string
  onChange: (action: Action) => void
}) {
  const id = action.id

  return (
    <div className="space-y-2 rounded-lg border border-[var(--color-border-subtle)] p-2">
      <label className="block space-y-1">
        <span className={LABEL}>Действие</span>
        <select
          value={action.type}
          onChange={(event) => {
            const type = event.target.value as Action['type']
            switch (type) {
              case 'open_screen':
                return onChange({ id, type, screenId: screens[0]?.id ?? '' })
              case 'create_row':
                return onChange({ id, type, tableId, values: {} })
              case 'update_row':
                return onChange({ id, type, values: {} })
              case 'delete_row':
                return onChange({ id, type, confirm: true })
              case 'go_back':
                return onChange({ id, type })
              default:
                return onChange({ id, type, source: { kind: 'field', fieldId: fields[0]?.id ?? '' } })
            }
          }}
          className={INPUT}
        >
          {Object.entries(ACTION_LABELS).map(([value, title]) => (
            <option key={value} value={value}>
              {title}
            </option>
          ))}
        </select>
      </label>

      {action.type === 'open_screen' ? (
        <label className="block space-y-1">
          <span className={LABEL}>Экран</span>
          <select
            value={action.screenId}
            onChange={(event) => onChange({ ...action, screenId: event.target.value })}
            className={INPUT}
          >
            {screens.map((screen) => (
              <option key={screen.id} value={screen.id}>
                {screen.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {action.type === 'open_url' || action.type === 'call_phone' || action.type === 'send_email' ? (
        <BindingEditor
          label="Откуда взять значение"
          value={action.source}
          fields={fields}
          onChange={(source) => onChange({ ...action, source })}
        />
      ) : null}

      {action.type === 'delete_row' ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={action.confirm}
            onChange={(event) => onChange({ ...action, confirm: event.target.checked })}
          />
          Спрашивать подтверждение
        </label>
      ) : null}
    </div>
  )
}

export function ComponentSettings({
  component,
  fields,
  screens,
  tableId,
  ownerFieldId,
  onChange,
}: {
  component: Component
  fields: Field[]
  screens: Screen[]
  tableId: string
  /** Поле-владелец строки из правила доступа: его значение задаёт сервер. */
  ownerFieldId?: string | null
  onChange: (component: Component) => void
}) {
  const ownerWarning =
    ownerFieldId &&
    (component.type === 'form_field' || component.type === 'field') &&
    component.fieldId === ownerFieldId ? (
      <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
        По этому полю работает правило «пользователь видит только свои строки».
        Сервер проставляет владельца сам, поэтому введённое здесь значение будет
        проигнорировано.
      </p>
    ) : null

  const relations = fields.filter((field) => field.type === 'relation')
  const images = fields.filter((field) => field.type === 'image' || field.type === 'attachment')

  switch (component.type) {
    case 'heading':
    case 'text':
      return (
        <div className="space-y-2">
          <BindingEditor
            label="Что показывать"
            value={component.source}
            fields={fields}
            onChange={(source) => onChange({ ...component, source })}
          />
          <label className="block space-y-1">
            <span className={LABEL}>{component.type === 'heading' ? 'Размер' : 'Стиль'}</span>
            {component.type === 'heading' ? (
              <select
                value={component.size}
                onChange={(event) => onChange({ ...component, size: event.target.value as 's' | 'm' | 'l' })}
                className={INPUT}
              >
                <option value="s">мелкий</option>
                <option value="m">средний</option>
                <option value="l">крупный</option>
              </select>
            ) : (
              <select
                value={component.style}
                onChange={(event) =>
                  onChange({ ...component, style: event.target.value as 'body' | 'caption' | 'quote' })
                }
                className={INPUT}
              >
                <option value="body">обычный</option>
                <option value="caption">подпись</option>
                <option value="quote">цитата</option>
              </select>
            )}
          </label>
        </div>
      )

    case 'field':
      return (
        <div className="space-y-2">
          {ownerWarning}
          <FieldPicker
            label="Поле"
            value={component.fieldId}
            fields={fields}
            onChange={(fieldId) => onChange({ ...component, fieldId })}
          />
          <label className="block space-y-1">
            <span className={LABEL}>Подпись (пусто — имя поля)</span>
            <input
              value={component.label ?? ''}
              onChange={(event) => onChange({ ...component, label: event.target.value || null })}
              className={INPUT}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={component.showWhenEmpty}
              onChange={(event) => onChange({ ...component, showWhenEmpty: event.target.checked })}
            />
            Показывать, даже если пусто
          </label>
        </div>
      )

    case 'form_field':
      return (
        <div className="space-y-2">
          {ownerWarning}
          <FieldPicker
            label="Поле"
            value={component.fieldId}
            fields={fields}
            onChange={(fieldId) => onChange({ ...component, fieldId })}
          />
          <label className="block space-y-1">
            <span className={LABEL}>Подпись</span>
            <input
              value={component.label ?? ''}
              onChange={(event) => onChange({ ...component, label: event.target.value || null })}
              className={INPUT}
            />
          </label>
          <label className="block space-y-1">
            <span className={LABEL}>Подсказка в поле</span>
            <input
              value={component.placeholder ?? ''}
              onChange={(event) => onChange({ ...component, placeholder: event.target.value || null })}
              className={INPUT}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={component.required}
              onChange={(event) => onChange({ ...component, required: event.target.checked })}
            />
            Обязательное
          </label>
        </div>
      )

    case 'button':
      return (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className={LABEL}>Надпись</span>
            <input
              value={component.label}
              onChange={(event) => onChange({ ...component, label: event.target.value })}
              className={INPUT}
            />
          </label>
          <label className="block space-y-1">
            <span className={LABEL}>Вид</span>
            <select
              value={component.style}
              onChange={(event) =>
                onChange({ ...component, style: event.target.value as 'primary' | 'secondary' | 'danger' | 'ghost' })
              }
              className={INPUT}
            >
              <option value="primary">основная</option>
              <option value="secondary">второстепенная</option>
              <option value="danger">опасная</option>
              <option value="ghost">без рамки</option>
            </select>
          </label>
          <ActionEditor
            action={component.action}
            screens={screens}
            fields={fields}
            tableId={tableId}
            onChange={(action) => onChange({ ...component, action })}
          />
        </div>
      )

    case 'image':
    case 'gallery':
      return (
        <div className="space-y-2">
          {images.length === 0 ? (
            <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              В таблице нет полей с изображениями или вложениями.
            </p>
          ) : null}
          <FieldPicker
            label="Поле с файлами"
            value={component.fieldId}
            fields={images}
            onChange={(fieldId) => onChange({ ...component, fieldId })}
          />
        </div>
      )

    case 'related_list':
      return (
        <div className="space-y-2">
          {relations.length === 0 ? (
            <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              Нужна связь с другой таблицей — добавьте поле типа «Связь».
            </p>
          ) : null}
          <FieldPicker
            label="Через связь"
            value={component.relationFieldId}
            fields={relations}
            onChange={(relationFieldId) => onChange({ ...component, relationFieldId })}
          />
          <label className="block space-y-1">
            <span className={LABEL}>Открывать экран</span>
            <select
              value={component.onTapScreenId ?? ''}
              onChange={(event) => onChange({ ...component, onTapScreenId: event.target.value || null })}
              className={INPUT}
            >
              <option value="">не открывать</option>
              {screens.map((screen) => (
                <option key={screen.id} value={screen.id}>
                  {screen.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )

    case 'card':
      return (
        <FieldPicker
          label="Заголовок карточки"
          value={component.titleFieldId}
          fields={fields}
          allowEmpty
          onChange={(titleFieldId) => onChange({ ...component, titleFieldId: titleFieldId || null })}
        />
      )

    case 'divider':
      return <p className="text-xs text-[var(--color-ink-muted)]">У разделителя нет настроек.</p>

    default:
      return null
  }
}

/** Заготовка компонента при добавлении: сразу с разумными значениями. */
export function makeComponent(type: Component['type'], position: string, fields: Field[], screens: Screen[]): Component {
  // roles: null — «как у экрана». Новый компонент не должен сужать доступ
  // молча: сузить его владелец решает осознанно.
  const base = { id: newId('component'), position, visibleWhen: null, roles: null }
  const firstField = fields[0]
  const relation = fields.find((field) => field.type === 'relation')
  const image = fields.find((field) => field.type === 'image' || field.type === 'attachment')

  switch (type) {
    case 'heading':
      return { ...base, type, source: { kind: 'field', fieldId: firstField?.id ?? '' }, size: 'm' }
    case 'text':
      return { ...base, type, source: { kind: 'literal', value: 'Текст' }, style: 'body' }
    case 'image':
      return { ...base, type, fieldId: image?.id ?? '', aspect: 'wide' }
    case 'gallery':
      return { ...base, type, fieldId: image?.id ?? '', columns: 2 }
    case 'field':
      return { ...base, type, fieldId: firstField?.id ?? '', label: null, showWhenEmpty: false }
    case 'form_field':
      return { ...base, type, fieldId: firstField?.id ?? '', label: null, required: false, placeholder: null }
    case 'button':
      return {
        ...base,
        type,
        label: 'Кнопка',
        style: 'primary',
        action: { id: newId('action'), type: 'open_screen', screenId: screens[0]?.id ?? '' },
      }
    case 'related_list':
      return {
        ...base,
        type,
        relationFieldId: relation?.id ?? '',
        titleFieldId: null,
        subtitleFieldId: null,
        imageFieldId: null,
        onTapScreenId: null,
        limit: 20,
      }
    case 'card':
      return {
        ...base,
        type,
        titleFieldId: firstField?.id ?? null,
        subtitleFieldId: null,
        imageFieldId: null,
      }
    case 'divider':
      return { ...base, type }
  }
}

/**
 * Короткое описание компонента для списка.
 * Семь строк «Поле формы» подряд неразличимы, поэтому показываем привязку.
 */
export function describeComponent(component: Component, fields: Field[]): string | null {
  const nameOf = (fieldId: string) => fields.find((field) => field.id === fieldId)?.name ?? '—'

  switch (component.type) {
    case 'field':
    case 'form_field':
    case 'image':
    case 'gallery':
      return nameOf(component.fieldId)
    case 'related_list':
      return nameOf(component.relationFieldId)
    case 'card':
      return component.titleFieldId ? nameOf(component.titleFieldId) : null
    case 'button':
      return component.label
    case 'heading':
    case 'text':
      return component.source.kind === 'field'
        ? nameOf(component.source.fieldId)
        : component.source.kind === 'literal'
          ? String(component.source.value ?? '').slice(0, 24)
          : 'вошедший пользователь'
    default:
      return null
  }
}
