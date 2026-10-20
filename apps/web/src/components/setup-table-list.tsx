import Link from 'next/link'
import type { DirectoryTable } from '@/lib/table-directory-data'
import { setupTableHref, type SetupStep } from '@/lib/guided-setup'
import { ownerSecondary } from './owner-ui'

export function SetupTableList({ tables, appId, step, canEdit }: {
  tables: (Pick<DirectoryTable, 'id' | 'name'> & { description: string })[]
  appId?: string; step: SetupStep; canEdit: boolean
}) {
  return <ul className="divide-y divide-sand-200 rounded-2xl border border-sand-200 bg-white px-5 sm:px-6">
    {tables.map(table => <li key={table.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
      <div className="min-w-0 flex-1 basis-56"><h3 className="break-words font-medium">{table.name}</h3><p className="mt-1 max-w-xl text-sm leading-6 text-ink-soft">{table.description}</p></div>
      <Link href={setupTableHref(table.id, appId, step, !canEdit)} className={ownerSecondary} aria-label={`${canEdit ? 'Открыть таблицу' : 'Посмотреть таблицу'} «${table.name}»`}>{canEdit ? 'Открыть таблицу' : 'Посмотреть'}</Link>
    </li>)}
  </ul>
}
