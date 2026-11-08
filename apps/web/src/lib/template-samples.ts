export type SampleRow = { id: string; tableId: string; sample: boolean; data: unknown; deletedAt: Date | null }
export type SampleRelation = { id: string; tableId: string; targetTableId: string }

/** Keep a sample once retained data depends on it, including indirect references. */
export function removableSamples(tableIds: readonly string[], rows: readonly SampleRow[], relations: readonly SampleRelation[]) {
  const scope = new Set(tableIds)
  const active = rows.filter(row => !row.deletedAt)
  const byId = new Map(active.map(row => [row.id, row]))
  const candidates = new Map(active.filter(row => row.sample && scope.has(row.tableId)).map(row => [row.id, row]))
  const references = new Map<string, string[]>()
  for (const row of active) {
    const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {}
    const targets = relations.filter(field => field.tableId === row.tableId).flatMap(field => {
      const value = data[field.id]
      const ids = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
      return ids.filter((id): id is string => typeof id === 'string' && byId.get(id)?.tableId === field.targetTableId)
    })
    for (const target of targets) {
      references.set(row.id, [...references.get(row.id) ?? [], target])
      references.set(target, [...references.get(target) ?? [], row.id])
    }
  }
  const retained = active.filter(row => !candidates.has(row.id)).map(row => row.id)
  for (let at = 0; at < retained.length; at++) {
    for (const id of references.get(retained[at]!) ?? []) {
      if (candidates.delete(id)) retained.push(id)
    }
  }
  return [...candidates.values()]
}
