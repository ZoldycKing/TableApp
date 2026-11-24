import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { storeAttachment } from '../file-upload'
import { supportPortraitFile } from './support-portraits'

export async function stageSupportPortrait(workspaceId: string, userId: string, personName: unknown) {
  const name = supportPortraitFile(personName)
  if (!name) return null
  const relative = join('public', 'template-media', 'support', name)
  const bytes = await readFile(join(process.cwd(), relative)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return readFile(join(process.cwd(), 'apps', 'web', relative))
  })
  return storeAttachment(workspaceId, userId, 'manual', { name, type: 'image/jpeg', bytes })
}
