import { needFor, shortagesOf } from './production'

/** Public examples only: these are fictional norms and material balances. */
export type DemoProductionData = {
  norms: { productId: string; materialId: string; perUnit: number }[]
  materials: { id: string; name: string; unit: string; stock: number }[]
}

export function demoConsumption(data: DemoProductionData, productId: string, quantity: number) {
  if (!productId || !Number.isFinite(quantity) || quantity <= 0) return null
  const needs = needFor(quantity, data.norms.filter(norm => norm.productId === productId))
  const materials = new Map(data.materials.map(material => [material.id, material]))
  const missing = new Map(shortagesOf(needs, new Map(data.materials.map(material => [material.id, material.stock]))).map(item => [item.materialId, item.missing]))
  return { quantity, lines: needs.map(need => ({ materialId: need.materialId,
    material: materials.get(need.materialId)?.name ?? 'Материал удалён', unit: materials.get(need.materialId)?.unit ?? '',
    need: need.amount, stock: materials.get(need.materialId)?.stock ?? 0, missing: missing.get(need.materialId) ?? 0 })) }
}
