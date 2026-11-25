/** Bundled demo photos for the Прокат seed (local public/ assets). Laser has none on purpose. */
export const PROKAT_SAMPLE_ITEMS = [
  { serial: 'ВЕЛ-1001', name: 'Горный велосипед Trek Marlin 7', file: 'bike-mtb.webp' },
  { serial: 'ВЕЛ-1002', name: 'Городской велосипед Electra', file: 'bike-city.webp' },
  { serial: 'ВЕЛ-1003', name: 'Шоссейный велосипед Giant Contend', file: 'bike-road.webp' },
  { serial: 'ВЕЛ-1004', name: 'Детский велосипед 20"', file: 'bike-kids.webp' },
  { serial: 'СУП-2001', name: 'SUP Red Paddle 10\'6"', file: 'sup-red.webp' },
  { serial: 'СУП-2002', name: 'SUP Aqua Marina Magma', file: 'sup-blue.webp' },
  { serial: 'СУП-2003', name: 'SUP детский 8\'', file: 'sup-kids.webp' },
  { serial: 'ИНСТ-3001', name: 'Перфоратор Bosch GBH 2-26', file: 'drill.webp' },
  { serial: 'ИНСТ-3002', name: 'Циркулярная пила Makita', file: 'saw.webp' },
] as const

export function prokatSampleImage(nameOrSerial: unknown) {
  if (typeof nameOrSerial !== 'string') return null
  const hit = PROKAT_SAMPLE_ITEMS.find(item => item.name === nameOrSerial || item.serial === nameOrSerial)
  return hit?.file ?? null
}

export function prokatSamplePublicPath(nameOrSerial: unknown) {
  const file = prokatSampleImage(nameOrSerial)
  return file ? `/template-media/prokat/${file}` : null
}
