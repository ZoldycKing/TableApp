import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { attachments, db } from '@tableapp/db'
import { and, eq, inArray } from 'drizzle-orm'
import { removeTrackedAttachment, storeAttachment } from '../file-upload'
import { inventorySampleImage } from './inventory-samples'

type StagedFile = Awaited<ReturnType<typeof storeAttachment>>

export async function stageInventorySampleFile(workspaceId: string, userId: string, productName: unknown) {
  const name = inventorySampleImage(productName)
  if (!name) return null
  const relative = join('public', 'template-media', 'inventory', name)
  const bytes = await readFile(join(process.cwd(), relative)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return readFile(join(process.cwd(), 'apps', 'web', relative))
  })
  return storeAttachment(workspaceId, userId, 'manual', { name, type: 'image/webp', bytes })
}

/** Files reserved before a failed install are safe to release only while unlinked. */
export async function discardInventorySampleFiles(workspaceId: string, staged: readonly StagedFile[]) {
  if (!staged.length) return
  const unlinked = await db.update(attachments).set({ state: 'deleting' })
    .where(and(eq(attachments.workspaceId, workspaceId), eq(attachments.state, 'ready'), eq(attachments.referenced, false),
      inArray(attachments.id, staged.map(file => file.id))))
    .returning({ id: attachments.id, key: attachments.key })
  await Promise.allSettled(unlinked.map(file => removeTrackedAttachment(file.id, workspaceId, file.key)))
}
