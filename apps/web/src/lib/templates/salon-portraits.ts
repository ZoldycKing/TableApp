import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { storeAttachment } from '../file-upload'

/** Original studio portraits shipped with the salon starter. Icon stays when a row has no file. */
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

export async function stageSalonPortrait(workspaceId: string, userId: string, personName: unknown) {
  const name = salonPortraitFile(personName)
  if (!name) return null
  const relative = join('public', 'template-media', 'salon', name)
  const bytes = await readFile(join(process.cwd(), relative)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return readFile(join(process.cwd(), 'apps', 'web', relative))
  })
  return storeAttachment(workspaceId, userId, 'manual', { name, type: 'image/jpeg', bytes })
}
