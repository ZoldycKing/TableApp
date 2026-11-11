import { appV2ChildIds, type AppV2, type AppV2Node, type AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderLearningProgress } from './builder-learning-types'

export type BuilderV2CollectionGroup = { key: string; label: string }
export type BuilderV2OrderSummary = { amount: number | null; scoped?: boolean; status?: { kind: 'same'; label: string } | { kind: 'mixed' } }
export type BuilderV2DataRecord = AppV2Record & { display: Record<string, string>; visibleNodeIds?:string[];canMove?:boolean; group?: BuilderV2CollectionGroup; summary?: { count: number; amount: number | null } }
export type BuilderV2ReadScope = { screenId?: string; recordId?: string }
export type BuilderV2DataRequest = BuilderV2ReadScope & { nodeId: string; search?: string; cursor?: string;calendarMonth?:string;calendarDay?:string;boardColumn?:string }
export type BuilderV2DataPage = { kind: 'collection' | 'metric' | 'chart'; rows: BuilderV2DataRecord[]; value: number | null; total: number; next: string | null; orderSummary?: BuilderV2OrderSummary;chart?:BuilderV2ChartData;calendar?:{month:string;day:string|null;days:Record<string,number>;undated:number;timeZone:string};board?:{columns:{key:string;name:string;total:number;rows:BuilderV2DataRecord[];next:string|null}[];}; search?: string; clearSearch?: () => void }
export type BuilderV2DataResult = { ok: true; page: BuilderV2DataPage } | { ok: false; error: string; stale?: boolean }
export type BuilderV2RecordResult = { ok: true; record: BuilderV2DataRecord; title: string; learning?: BuilderLearningProgress; learningError?: string } | { ok: false; error: string }

export function builderV2ScreenNodes(app: AppV2, screenId: string): AppV2Node[] {
  const ids = new Set<string>(), pending = [...(app.screens.find(screen => screen.id === screenId)?.rootIds ?? [])]
  while (pending.length) { const id = pending.pop()!; if (ids.has(id)) continue; ids.add(id); const node = app.nodes.find(node => node.id === id); if (node) pending.push(...appV2ChildIds(node)) }
  return app.nodes.filter(node => ids.has(node.id))
}

/** Stable query identity independent from unrelated headings or application renaming. */
export function builderV2DataNodes(app: AppV2, node: AppV2Node): AppV2Node[] {
  const ids = new Set<string>(), pending = [node.id]
  while (pending.length) { const id = pending.pop()!; if (ids.has(id)) continue; ids.add(id); const child = app.nodes.find(node => node.id === id); if (child) pending.push(...appV2ChildIds(child)) }
  return app.nodes.filter(node => ids.has(node.id))
}
export const builderV2DataKey = (app: AppV2, node: AppV2Node, scope?: BuilderV2ReadScope) => JSON.stringify([app.id, app.workspaceId, builderV2DataNodes(app, node), 'sourceId' in node ? app.sources.find(source => source.id === node.sourceId) : null, scope ?? null, app.screens.find(screen => screen.id === scope?.screenId)?.contextTableId ?? null])

export type BuilderV2ChartPoint={key:string;label:string;value:number|null;count:number;date?:string}
export type BuilderV2ChartData={points:BuilderV2ChartPoint[];groupLabel:string;valueLabel:string;totalRows:number;numericRows:number;groupCount:number;remainderGroups:number;undated:number;timeZone?:string}
