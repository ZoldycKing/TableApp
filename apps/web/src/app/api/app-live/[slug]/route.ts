import { loadApp } from '@/lib/app-write-access'
import { currentAppAccess } from '@/lib/app-session'
import { canEnter } from '@/lib/app-roles'
import { loadPublishedApp } from '@/lib/app-runtime'
import { tableLiveStream } from '@/lib/table-live-stream'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const app = await loadApp(slug)
  if (!app) return new Response('Приложение недоступно', { status: 404 })
  const access = await currentAppAccess(app)
  if (!canEnter(app, access.visitor)) return new Response('Доступ закрыт', { status: 403 })
  const definition = await loadPublishedApp(slug, access.visitor)
  if (!definition) return new Response('Приложение недоступно', { status: 404 })
  const ids = Object.keys(definition.tables).sort()
  const scope = JSON.stringify(app)
  const identity = JSON.stringify(access.visitor)
  const authorize = async () => {
    const fresh = await loadApp(slug)
    if (!fresh) return false
    const current = await currentAppAccess(fresh)
    if (!canEnter(fresh, current.visitor)) return false
    // A published definition or visitor change requires a fresh projection.
    // Permission checks do not need to load every row again on each event.
    return JSON.stringify(current.visitor) === identity && JSON.stringify(fresh) === scope
  }
  return new Response(tableLiveStream(ids, request.signal, authorize, 25_000, true), { headers: {
    'content-type': 'text/event-stream', 'cache-control': 'no-store, no-transform',
    connection: 'keep-alive', 'x-accel-buffering': 'no',
  } })
}
