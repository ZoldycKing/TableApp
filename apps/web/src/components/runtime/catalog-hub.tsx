'use client'

import type { RuntimeApp } from '@/lib/app-runtime'
import { CollectionView } from './collection-view'
import { EMPTY_LIST_STATE, type ListState } from './nav-history'
import { MODULE_DEFINITIONS } from '@tableapp/schema'
import type { RuntimePageControls } from '@/lib/use-screen-runtime'
import { catalogFieldUnits } from '@/lib/catalog-field-units'

export function CatalogHub({ runtime, state, onState, onOpenRow, pageControls }: { runtime: RuntimeApp; state: ListState; onState: (state: ListState) => void; onOpenRow: (screenId: string, rowId: string) => void; pageControls?: Readonly<Record<string, RuntimePageControls>> }) {
  return <div className="space-y-6">
    <label className="block"><span className="sr-only">Поиск по каталогу</span><input value={state.query} onChange={event => onState({ ...state, query: event.target.value })} placeholder="Найти услугу или товар" className="w-full rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sand-400" /></label>
    {(runtime.app.catalogScreenIds ?? []).map(id => {
      const screen = runtime.app.screens.find(screen => screen.id === id)
      if (!screen || (screen.type !== 'list' && screen.type !== 'tiles')) return null
      const view = runtime.views[screen.source.viewId], table = view ? runtime.tables[view.tableId] : null
      if (!table) return null
      const byId = new Map(table.rows.map(row => [row.id, row]))
      const rows = (runtime.screens[id]?.rowIds ?? []).flatMap(id => byId.has(id) ? [byId.get(id)!] : [])
      const module = runtime.app.modules?.find(module => module.screenIds?.includes(id))
      const title = module?.kind === 'booking' ? 'Услуги' : module?.kind === 'sales' ? 'Товары' : module?.kind === 'property' ? 'Объекты' : module ? MODULE_DEFINITIONS[module.kind].name : screen.name
      return <section key={id} className="space-y-3"><h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <CollectionView screen={screen} fields={table.fields} rows={rows} relatedTitles={runtime.relatedTitles} fieldUnits={catalogFieldUnits(runtime.app, table.id)}
          state={{ ...EMPTY_LIST_STATE, query: state.query }} onState={next => onState({ ...state, query: next.query })} exportHref={null} showToolbar={false}
          page={runtime.screens[id]?.page} pageControls={pageControls?.[id]}
          onOpenRow={screen.onTapScreenId ? rowId => onOpenRow(screen.onTapScreenId!, rowId) : null} />
      </section>
    })}
  </div>
}
