'use client'

import type { App, Field, RowMatch } from '@tableapp/schema'
import { GUEST_ROLE } from '@tableapp/schema'
import { rolesForRowRules } from '@/lib/app-roles'
import type { TableSummary } from '@/lib/queries'
import { ownerInput, ownerSecondary } from '../owner-ui'
import { ShellIcon } from '../shell/icons'

const TEXTUAL = new Set(['email', 'text'])

export function RowRules({ app, tables, onChange }: {
  app: App; tables: TableSummary[]; onChange: (next: App) => void
}) {
  const rules = app.rowAccessRules
  const setRules = (next: App['rowAccessRules']) => onChange({ ...app, rowAccessRules: next })
  const fieldsOf = (tableId: string): Field[] =>
    (tables.find(table => table.id === tableId)?.fields ?? []).filter(field => TEXTUAL.has(field.type))
  const add = () => {
    const table = tables[0]
    if (!table) return
    const candidates = fieldsOf(table.id)
    const chosen = candidates.find(field => field.type === 'email') ?? candidates[0]
    setRules([...rules, { tableId: table.id, fieldId: chosen?.id ?? '', match: 'email',
      appliesTo: [GUEST_ROLE, ...app.roles.filter(role => role.isDefault).map(role => role.id)] }])
  }
  const patch = (index: number, changes: Partial<App['rowAccessRules'][number]>) =>
    setRules(rules.map((rule, at) => at === index ? { ...rule, ...changes } : rule))

  return <section className="space-y-4" aria-label="Ограничения по строкам">
    <div>
      <h3 className="text-base font-semibold">Какие строки видит человек</h3>
      <p className="mt-2 text-sm leading-6 text-ink-soft">Показывайте строки с почтой или организацией человека. Сотрудники без таких ограничений видят все доступные им строки.</p>
    </div>
    {rules.map((rule, index) => {
      const fields = fieldsOf(rule.tableId)
      const companyKnown = app.allowlist.some(entry => entry.company.trim() !== '')
      return <fieldset key={index} className="min-w-0 space-y-4 rounded-xl border border-sand-200 p-3">
        <legend className="px-1 text-sm font-semibold">Ограничение {index + 1}</legend>
        <div className="grid min-w-0 gap-4 @min-[640px]:grid-cols-2">
          <label className="min-w-0 text-sm text-ink-soft">Таблица
            <select value={rule.tableId} className={ownerInput} onChange={event => {
              const tableId = event.target.value, candidates = fieldsOf(tableId)
              const chosen = candidates.find(field => field.type === 'email') ?? candidates[0]
              patch(index, { tableId, fieldId: chosen?.id ?? '' })
            }}>{tables.map(table => <option key={table.id} value={table.id}>{table.name}</option>)}</select>
          </label>
          <label className="min-w-0 text-sm text-ink-soft">Колонка для сравнения
            <select value={rule.fieldId} className={ownerInput} onChange={event => patch(index, { fieldId: event.target.value })}>
              <option value="">Выберите колонку</option>
              {fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-sm text-ink-soft @min-[640px]:col-span-2">Значение должно совпадать с
            <select value={rule.match} className={ownerInput} onChange={event => patch(index, { match: event.target.value as RowMatch })}>
              <option value="email">Почтой человека</option>
              <option value="company">Организацией человека</option>
            </select>
          </label>
        </div>
        {!fields.length ? <p className="text-sm leading-6 text-amber-900">В этой таблице нет подходящих колонок. Добавьте колонку с почтой или текстом либо выберите другую таблицу.</p> : null}
        {rule.match === 'company' && !companyKnown ? <p className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">Сначала укажите организацию человека в списке доступа. Без неё он не увидит строки по этому ограничению.</p> : null}
        <fieldset className="space-y-1">
          <legend className="mb-2 text-sm font-medium">Для каких ролей</legend>
          {rolesForRowRules(app).map(role => <label key={role.id} className="flex min-h-11 items-start gap-3 py-2 text-sm leading-6">
            <input type="checkbox" className="mt-1 size-4 shrink-0 accent-sage-700 focus-visible:ring-2 focus-visible:ring-sage-400"
              checked={rule.appliesTo.includes(role.id)} onChange={() => patch(index, {
                appliesTo: rule.appliesTo.includes(role.id) ? rule.appliesTo.filter(item => item !== role.id) : [...rule.appliesTo, role.id],
              })} />
            <span>{role.name}{role.id === GUEST_ROLE ? <span className="block text-xs leading-5 text-ink-soft">Это ограничение скрывает строки до входа.</span> : null}</span>
          </label>)}
        </fieldset>
        <button type="button" aria-label={`Удалить ограничение ${index + 1}`}
          onClick={() => setRules(rules.filter((_, at) => at !== index))}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-ink-soft hover:bg-sand-100 focus-visible:ring-2 focus-visible:ring-sage-400">
          <ShellIcon name="close" />Удалить ограничение
        </button>
      </fieldset>
    })}
    <button type="button" onClick={add} disabled={tables.length === 0} className={ownerSecondary}>Добавить ограничение</button>
    {rules.length > 1 ? <p className="text-sm leading-6 text-ink-soft">Если для одной роли и таблицы добавлено несколько ограничений, достаточно совпадения по любому из них.</p> : null}
  </section>
}
