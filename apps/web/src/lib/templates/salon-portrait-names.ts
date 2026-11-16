/** Public portrait files for the salon starter. Safe to import from client previews. */
const portraits: Record<string, string> = {
  'Оля': 'salon-olya.jpg',
  'Женя': 'salon-zhenya.jpg',
  'Наташа': 'salon-natasha.jpg',
  'Кира': 'salon-kira.jpg',
  'Марина': 'salon-marina.jpg',
  'Павел': 'salon-pavel.jpg',
  'Ирина П.': 'salon-irina.jpg',
  'Мария К.': 'salon-maria.jpg',
  'Алексей Г.': 'salon-alexey.jpg',
  'Светлана М.': 'salon-svetlana.jpg',
  'Борис С.': 'salon-boris.jpg',
  'Анна В.': 'salon-anna.jpg',
  'Ольга Д.': 'salon-olga.jpg',
}

export function salonPortraitFile(name: unknown) {
  return typeof name === 'string' ? portraits[name] ?? null : null
}

/** Browser path for a teaching preview. Installation still uploads the same file into storage. */
export function salonPortraitUrl(name: unknown) {
  const file = salonPortraitFile(name)
  return file ? `/template-media/salon/${file}` : null
}
