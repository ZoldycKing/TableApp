import { appV2ChildIds, type AppV2, type AppV2Json, type AppV2Node } from '@tableapp/schema/app-v2'
import type { FieldType } from '@tableapp/schema'

export type BuilderV2Form = Extract<AppV2Node, { type: 'form' }>
export type BuilderV2Input = Extract<AppV2Node, { type: 'input' }>
export const BUILDER_V2_FORM_TYPES: readonly FieldType[] = ['text', 'long_text', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'checkbox', 'single_select', 'multi_select', 'relation', 'image', 'attachment']
export type BuilderV2FormField = { nodeId: string; fieldId: string; label: string; type: FieldType; required: boolean; readOnly: boolean; supported: boolean; choices?: { id: string; name: string }[]; allowMultiple?: boolean; timeZone?: string; maxCount?: number }
export type BuilderV2FormState = { values: Record<string, AppV2Json>; labels: Record<string, string>; fields: BuilderV2FormField[]; fingerprint: string }
export type BuilderV2FormResult = { ok: true; state: BuilderV2FormState } | { ok: false; error: string; errors?: Record<string, string>; stale?: boolean }
export type BuilderV2FormScope = { formId: string; screenId: string; recordId?: string }
export type BuilderV2FormRequest = BuilderV2FormScope & ({ mode: 'initial' } | { mode: 'check'; values: Record<string, AppV2Json>; fingerprint: string } | { mode: 'options'; fieldId: string; search: string; after?: string })
export type BuilderV2FormOptionsResult = { ok: true; options: { id: string; label: string }[]; next: string | null } | { ok: false; error: string }

export function builderV2FormInputs(app: AppV2, form: BuilderV2Form): BuilderV2Input[] {
  const nodes = new Map(app.nodes.map(node => [node.id, node])), inputs: BuilderV2Input[] = [], seen = new Set<string>()
  const visit = (ids: readonly string[]) => { for (const id of ids) { if (seen.has(id)) continue; seen.add(id); const node = nodes.get(id); if (!node) continue; if (node.type === 'input') inputs.push(node); else if (node.type !== 'form' && node.type !== 'collection') visit(appV2ChildIds(node)) } }
  visit(form.childIds); return inputs
}
export const builderV2FormKey = (app: AppV2, form: BuilderV2Form, screenId: string, recordId?: string) => JSON.stringify([app.id, app.workspaceId, app.screens.find(screen => screen.id === screenId)?.contextTableId, screenId, recordId, form, builderV2FormInputs(app, form)])
