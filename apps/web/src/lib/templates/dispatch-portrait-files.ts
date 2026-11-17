import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { storeAttachment } from '../file-upload'
import { dispatchPortraitFile } from './dispatch-portraits'

export async function stageDispatchPortrait(workspaceId: string, userId: string, personName: unknown) {
  const name = dispatchPortraitFile(personName)
  if (!name) return null
  const relative = join('public', 'template-media', 'dispatch', name)
  const bytes = await readFile(join(process.cwd(), relative)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return readFile(join(process.cwd(), 'apps', 'web', relative))
  })
  return storeAttachment(workspaceId, userId, 'manual', { name, type: 'image/jpeg', bytes })
}
