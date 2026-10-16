import type { Field, ScreenOf } from '@tableapp/schema'

/** An enabled search also covers the text the person sees in each result. */
export function collectionSearchFields(screen: ScreenOf<'list'> | ScreenOf<'tiles'>, readableFields: readonly Field[]): Field[] {
  // An empty configured list deliberately disables search (for example, visit history).
  if (!screen.source.searchFieldIds.length) return []
  const ids = new Set([...screen.source.searchFieldIds, screen.titleFieldId, screen.subtitleFieldId, screen.metaFieldId])
  return readableFields.filter(field => ids.has(field.id))
}
