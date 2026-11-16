import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { storeAttachment } from '../file-upload'
import { salonPortraitFile } from './salon-portrait-names'

export { salonPortraitFile } from './salon-portrait-names'

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
