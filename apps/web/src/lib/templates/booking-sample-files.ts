import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { storeAttachment } from '../file-upload'
import { bookingSampleImage } from './booking-samples'
export async function stageBookingSampleFile(workspaceId: string, userId: string, serviceName: unknown) {
  const name = bookingSampleImage(serviceName)
  if (!name) return null
  const relative = join('public', 'template-media', 'booking', name)
  const bytes = await readFile(join(process.cwd(), relative)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return readFile(join(process.cwd(), 'apps', 'web', relative))
  })
  return storeAttachment(workspaceId, userId, 'manual', { name, type: 'image/webp', bytes })
}
