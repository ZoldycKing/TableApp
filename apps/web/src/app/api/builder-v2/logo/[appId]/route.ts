import { apps, db } from '@tableapp/db'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { eq } from 'drizzle-orm'
import { authorizeApp } from '@/lib/authorize'
import { builderV2Enabled } from '@/lib/builder-v2'
import { findBuilderV2Logo } from '@/lib/builder-v2-logo'
import { isBuilderV2LogoKey } from '@/lib/builder-v2-logo-types'
import { fileDeliveryHeaders } from '@/lib/file-policy'
import { getFile } from '@/lib/storage'

export async function GET(request: Request, { params }: { params: Promise<{ appId: string }> }) {
  const missing = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  const { appId } = await params
  const query = new URL(request.url).searchParams
  const key = query.get('key'), draft = query.get('draft') === '1'
  if (!builderV2Enabled() || appId.length > 128 || !key || key.length > 300 || !isBuilderV2LogoKey(key)) return missing()
  const [app] = await db.select({ workspaceId: apps.workspaceId, draft: apps.draft, published: apps.published })
    .from(apps).where(eq(apps.id, appId)).limit(1)
  if (!app) return missing()
  const definition = readAppDefinition(draft ? app.draft : app.published)
  if (!definition.ok || definition.formatVersion !== 2 || definition.app.id !== appId || definition.app.workspaceId !== app.workspaceId) return missing()
  if (draft ? !(await authorizeApp(appId, false)).ok : definition.app.theme.logoKey !== key) return missing()
  const record = await findBuilderV2Logo(db, app.workspaceId, appId, key)
  if (!record) return missing()
  const file = await getFile(key)
  if (!file || file.mime !== record.mime) return missing()
  return new Response(file.body, { headers: fileDeliveryHeaders(record.name, file.mime) })
}
