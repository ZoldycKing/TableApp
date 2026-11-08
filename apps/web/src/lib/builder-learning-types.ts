import type { AppV2 } from '@tableapp/schema/app-v2'
import { collectionCardScreen } from '@/components/builder/v2/collection-navigation'

export const BUILDER_LEARNING_STEPS = ['list','record','save','access','publish'] as const
export type BuilderLearningStep = typeof BUILDER_LEARNING_STEPS[number]
export type BuilderLearningIntent = 'start' | 'pause' | 'resume' | `skip_${BuilderLearningStep}` | `retry_${BuilderLearningStep}`
export type BuilderLearningTarget = { nodeId: string; screenId: string; tableId: string; name: string; cardScreenId: string | null }
export type BuilderLearningProgress = { version: 1; revision: string; list: 'pending' | 'done' | 'skipped'; record: 'pending' | 'done' | 'skipped'; save:'pending'|'done'|'skipped'; access:'pending'|'done'|'skipped'; publish:'pending'|'done'|'skipped'; paused: boolean; target: BuilderLearningTarget | null }
export type BuilderLearningResult = { ok: true; progress: BuilderLearningProgress | null } | { ok: false; error: string }
export const builderLearningStep = (progress: BuilderLearningProgress): BuilderLearningStep | null => BUILDER_LEARNING_STEPS.find(step=>progress[step]==='pending')??null

/** A usable menu list, including lists inside groups, but never a repeated item or a form. */
export function builderLearningTarget(app: AppV2, nodeId?: string): BuilderLearningTarget | null {
  const screens = [...app.screens.filter(screen => screen.id === app.homeScreenId), ...app.screens.filter(screen => screen.id !== app.homeScreenId)]
  for (const screen of screens.filter(screen => screen.navigation && !screen.contextTableId)) {
    const pending = [...screen.rootIds], seen = new Set<string>()
    while (pending.length) {
      const id = pending.shift()!
      if (seen.has(id)) continue
      seen.add(id)
      const node = app.nodes.find(node => node.id === id)
      if (node?.type === 'collection' && (!nodeId || node.id === nodeId)) {
        const source = app.sources.find(source => source.id === node.sourceId)
        if (source && !source.screenTableId) return { nodeId: node.id, screenId: screen.id, tableId: source.tableId, name: node.name, cardScreenId: collectionCardScreen(app, node) ?? null }
      }
      if (node?.type === 'group' || node?.type === 'columns') pending.push(...node.childIds)
    }
  }
  return null
}

export function builderLearningListSettings(app: AppV2, nodeId: string): string | null {
  const node = app.nodes.find(node => node.id === nodeId)
  if (node?.type !== 'collection') return null
  const source = app.sources.find(source => source.id === node.sourceId)
  return JSON.stringify([source?.tableId, node.titleFieldId, node.subtitleFieldId, node.layout])
}
