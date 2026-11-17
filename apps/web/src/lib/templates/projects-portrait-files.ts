import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { storeAttachment } from '../file-upload'
import { projectsPortraitFile } from './projects-portraits'

export async function stageProjectsPortrait(workspaceId: string, userId: string, personName: unknown) {
  const name = projectsPortraitFile(personName)
  if (!name) return null
  const relative = join('public', 'template-media', 'projects', name)
  const bytes = await readFile(join(process.cwd(), relative)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return readFile(join(process.cwd(), 'apps', 'web', relative))
  })
  return storeAttachment(workspaceId, userId, 'manual', { name, type: 'image/jpeg', bytes })
}
