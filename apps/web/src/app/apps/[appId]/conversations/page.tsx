import { apps, businessCustomers, conversations, db, fields, rows, tables, workspaces } from '@tableapp/db'
import { appSchema, dateInstant, fieldTimeZone, normalizeFieldOptions, type Field } from '@tableapp/schema'
import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppChrome } from '@/components/app-chrome'
import { ConversationPanel } from '@/components/runtime/conversation-panel'
import { listMemberships, requireMember } from '@/lib/session'
import { conversationResource } from '@/lib/conversation-resource'
import { PRIVATE_PAGE } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata = PRIVATE_PAGE
export default async function BusinessConversations({ params, searchParams }: {
  params: Promise<{ appId: string }>; searchParams: Promise<{ table?: string; row?: string; before?: string }>
}) {
  const member = await requireMember(), { appId } = await params, selected = await searchParams
  const [record] = await db.select({ app: apps, ownerId: workspaces.ownerId }).from(apps).innerJoin(workspaces, eq(workspaces.id, apps.workspaceId))
    .where(and(eq(apps.id, appId), eq(apps.workspaceId, member.workspaceId))).limit(1)
  if (!record || member.role !== 'owner' || member.userId !== record.ownerId) notFound()
  const parsed = appSchema.safeParse(record.app.published)
  if (!parsed.success) notFound()
  const app = { ...parsed.data, id: record.app.id, workspaceId: record.app.workspaceId, slug: record.app.slug }
  const cursor = selected.before?.split('~'), cursorDate = cursor?.[0] ? new Date(cursor[0]) : null
  if (selected.before && (!cursor || cursor.length !== 2 || cursor[1]!.length > 200 || !cursorDate || !Number.isFinite(cursorDate.getTime()))) notFound()
  const found = await db.select({ thread: conversations, data: rows.data, primaryFieldId: tables.primaryFieldId, customer: businessCustomers.name, email: businessCustomers.email, tableName: tables.name })
    .from(conversations).innerJoin(rows, and(eq(rows.id, conversations.rowId), eq(rows.tableId, conversations.tableId)))
    .innerJoin(tables, eq(tables.id, conversations.tableId)).innerJoin(businessCustomers, eq(businessCustomers.id, conversations.customerId))
    .where(and(eq(conversations.workspaceId, member.workspaceId), isNull(rows.deletedAt), cursorDate ? or(lt(conversations.createdAt, cursorDate), and(eq(conversations.createdAt, cursorDate), lt(conversations.id, cursor![1]!))) : undefined))
    .orderBy(desc(conversations.createdAt), desc(conversations.id)).limit(51)
  const page = found.slice(0, 50), next = found.length > 50 ? page.at(-1)!.thread : null
  const path = `/apps/${appId}/conversations`
  const eligible = page.filter(item => {
    const resource = conversationResource(app, item.thread.tableId)
    return resource && String((item.data as Record<string, unknown>)[resource.emailFieldId]).trim().toLowerCase() === item.email
  })
  const booking = app.booking, serviceIds = booking ? eligible.filter(item => item.thread.tableId === booking.tables.visits).flatMap(item => {
    const value = (item.data as Record<string, unknown>)[booking.visit.service]
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  }) : []
  const serviceRows = booking && serviceIds.length ? await db.select().from(rows).where(and(eq(rows.tableId, booking.tables.services), inArray(rows.id, serviceIds), isNull(rows.deletedAt))) : []
  const [startField] = booking ? await db.select().from(fields).where(eq(fields.id, booking.visit.start)) : []
  const zone = startField ? fieldTimeZone({ type: 'datetime', options: normalizeFieldOptions('datetime', startField.options) as Field['options'] }) : 'UTC'
  const title = (item: typeof eligible[number]) => {
    const data = item.data as Record<string, unknown>
    if (booking && item.thread.tableId === booking.tables.visits) {
      const value = data[booking.visit.service], serviceId = Array.isArray(value) ? value[0] : null
      const service = serviceRows.find(row => row.id === serviceId), instant = dateInstant(data[booking.visit.start])
      return `${String((service?.data as Record<string, unknown> | undefined)?.[booking.service.name] ?? 'Запись')}${instant ? ` · ${new Date(instant).toLocaleString('ru-RU', { timeZone: zone })}` : ''}`
    }
    return String(data[item.primaryFieldId ?? ''] ?? item.tableName)
  }
  const validSelection = selected.table && selected.row && selected.table.length <= 200 && selected.row.length <= 200 && conversationResource(app, selected.table)
  return <AppChrome member={member} memberships={await listMemberships(member.userId)} activeWorkspaceId={member.workspaceId}><main className="mx-auto w-full max-w-5xl space-y-6 p-6">
    <div><Link href={`/apps/${appId}`} className="text-sm text-sage-700 underline">К настройкам приложения</Link><h1 className="mt-3 text-2xl font-semibold">Переписка · {app.name}</h1>
      <p className="mt-2 text-sm text-ink-muted">Диалоги по обращениям вашего бизнеса. Сотрудники отвечают из доступных им рабочих карточек.</p></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]"><nav aria-label="Диалоги клиентов" className="space-y-2">
      {eligible.map(item => <Link key={item.thread.id} href={`${path}?table=${encodeURIComponent(item.thread.tableId)}&row=${encodeURIComponent(item.thread.rowId)}`} className="block rounded-xl border border-sand-200 bg-white p-3 hover:bg-sand-50">
        <p className="text-sm font-medium">{title(item)}</p>
        <p className="mt-1 text-xs text-ink-muted">{item.customer || item.email} · {item.thread.closedAt ? 'Обсуждение завершено' : 'Открыто'}</p>
      </Link>)}
      {!eligible.length ? <p className="text-sm text-ink-muted">На этой странице диалогов пока нет. Они появятся после первого сообщения или загрузки файла.</p> : null}
      {next ? <Link className="block text-sm text-sage-700 underline" href={`${path}?before=${encodeURIComponent(`${next.createdAt.toISOString()}~${next.id}`)}`}>Следующие диалоги</Link> : null}
    </nav><div>{validSelection ? <ConversationPanel key={`${selected.table}:${selected.row}:${member.userId}`} slug={app.slug} tableId={selected.table!} rowId={selected.row!} configured business />
      : <p className="rounded-xl bg-sand-50 p-5 text-sm text-ink-muted">Выберите обращение слева, чтобы посмотреть сообщения, ответить или приложить документ.</p>}</div></div>
  </main></AppChrome>
}
