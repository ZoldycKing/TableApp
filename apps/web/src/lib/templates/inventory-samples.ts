/** Bundled demo photos for warehouse starter products (local public/ assets). */
export const INVENTORY_SAMPLE_PRODUCTS = [
  { sku: 'FA-120', name: 'Фильтр воздушный FA-120', file: 'FA-120.webp' },
  { sku: 'KTS-011', name: 'Термостат KTS-011', file: 'KTS-011.webp' },
  { sku: 'R410-11', name: 'Хладагент R-410A, баллон 11 кг', file: 'R410-11.webp' },
  { sku: 'TOOL-SH-18', name: 'Шуруповёрт аккумуляторный', file: 'TOOL-SH-18.webp' },
  { sku: 'GOF-125', name: 'Гофра алюминиевая 125 мм, 3 м', file: 'GOF-125.webp' },
  { sku: 'PMP-2560', name: 'Насос циркуляционный 25/60', file: 'PMP-2560.webp' },
  { sku: 'BOX-403020', name: 'Коробка гофрокартон 400×300×200', file: 'BOX-403020.webp' },
  { sku: 'GLV-10', name: 'Перчатки рабочие, пара', file: 'GLV-10.webp' },
  {
    sku: 'SEAL-FL-XL',
    name: 'Комплект уплотнителей для холодильной витрины серии FrostLine Pro XL с усиленным крепежом и запасными втулками',
    file: 'SEAL-FL-XL.webp',
  },
] as const

export function inventorySampleImage(name: unknown) {
  const product = INVENTORY_SAMPLE_PRODUCTS.find(item => item.name === name)
  return product?.file
}
