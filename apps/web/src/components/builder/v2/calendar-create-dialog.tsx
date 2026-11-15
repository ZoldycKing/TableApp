'use client'
import type { AppV2 } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import type { CalendarSlot } from '@/lib/team-calendar-prefill'
import { AppDialog } from './app-dialog'
import { BuilderV2FormInput, BuilderV2FormPreview } from './form-preview'

/** The configured create form, with the clicked employee and start already visible. */
export function CalendarCreateDialog({
  app, tables, screenId, formId, editing, onClose,
}: {
  app: AppV2
  tables: readonly BuilderV2Table[]
  screenId: string
  formId: string
  slot: CalendarSlot
  editing: boolean
  onClose: () => void
}) {
  const form = app.nodes.find(node => node.id === formId)
  if (form?.type !== 'form') return null
  const table = tables.find(item => item.id === form.tableId)
  return (
    <AppDialog title="Новая запись" onClose={onClose}>
      <BuilderV2FormPreview app={app} form={form} screenId={screenId} enabled={!editing} editing={editing}>
        {form.childIds.map(id => {
          const node = app.nodes.find(item => item.id === id)
          return node?.type === 'input' ? <BuilderV2FormInput key={id} node={node} table={table} /> : null
        })}
      </BuilderV2FormPreview>
    </AppDialog>
  )
}
