'use client'

import { useEffect, useId, useState } from 'react'
import type { Screen } from '@tableapp/schema'
import type { buildRuntimeNavigation } from '@/lib/runtime-navigation'
import { Icon, hasIcon } from './icons'
import type { accentTones } from './ui'

type Group = ReturnType<typeof buildRuntimeNavigation>['groups'][number]
type Props = {
  variant: 'desktop' | 'mobile'
  groups: readonly Group[]
  tabs: readonly Screen[]
  activeId?: string
  currentScreenId: string
  accent: ReturnType<typeof accentTones>
  onOpen: (screenId: string) => void
}

function icon(screen: Screen) {
  const chosen = screen.tab?.icon
  return chosen && chosen !== 'list' && hasIcon(chosen) ? chosen
    : screen.type === 'tiles' ? 'grid' : screen.type === 'form' ? 'plus' : screen.type === 'detail' ? 'file' : screen.type === 'dashboard' ? 'chart' : 'list'
}
const label = (screen: Screen) => screen.tab?.label ?? screen.name
const groupIcon = (kind: Group['kind']) => kind ? ({ sales: 'tag', inventory: 'box', production: 'clipboard', booking: 'calendar',
  repair: 'wrench', delivery: 'truck', field_service: 'clipboard', property: 'deal', crm: 'users', requests: 'inbox', support: 'chat' }[kind] ?? 'grid') : 'grid'

export function RuntimeNavigationView({ variant, groups, tabs, activeId, currentScreenId, accent, onOpen }: Props) {
  const [expanded, setExpanded] = useState(false)
  const menuId = useId()
  useEffect(() => { setExpanded(false) }, [currentScreenId])
  const groupedIds = new Set(groups.flatMap(group => group.screens.map(screen => screen.id)))
  const common = tabs.filter(screen => !groupedIds.has(screen.id))
  const open = (id: string) => { setExpanded(false); onOpen(id) }
  const row = (screen: Screen) => <button key={screen.id} type="button" aria-current={activeId === screen.id ? 'page' : undefined}
    onClick={() => open(screen.id)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${activeId === screen.id
      ? `${accent.soft} font-medium ${accent.text}` : 'text-ink-soft hover:bg-sand-50 hover:text-ink'}`}>
    <Icon name={icon(screen)} className="size-5 shrink-0" /><span className="min-w-0 truncate">{label(screen)}</span>
  </button>
  const groupedRows = groups.map(group => <div key={group.id} role="group" aria-label={group.label} className="space-y-1">
    <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-ink-muted">{group.label}</p>
    <div className="space-y-0.5">{group.screens.map(row)}</div>
  </div>)
  if (variant === 'desktop') return <div className="flex min-h-0 flex-1 flex-col">
    <nav aria-label="Разделы приложения" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      {groups.length ? <div className="space-y-4 pt-1">{groupedRows}</div> : <div className="space-y-0.5">{tabs.map(row)}</div>}
    </nav>
    {groups.length && common.length ? <nav aria-label="Общие разделы" className="mx-2 shrink-0 space-y-0.5 border-t border-sand-200 py-2">{common.map(row)}</nav> : null}
  </div>

  const representatives = groups.slice(0, 3).flatMap(group => {
    const screen = group.screens.find(screen => screen.type === 'list' || screen.type === 'tiles') ?? group.screens[0]
    return screen ? [{ id: screen.id, label: group.label, icon: groupIcon(group.kind), active: group.screens.some(screen => screen.id === activeId) }] : []
  })
  const main = groups.length ? representatives
    : tabs.slice(0, tabs.length > 5 ? 4 : 5).map(screen => ({ id: screen.id, label: label(screen), icon: icon(screen), active: screen.id === activeId }))
  const more = groups.length ? tabs.some(screen => !main.some(item => item.id === screen.id)) : tabs.length > 5
  return <nav aria-label="Основные разделы" onKeyDown={event => { if (event.key === 'Escape') setExpanded(false) }}
    className="relative flex shrink-0 border-t border-sand-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur @min-[641px]:hidden">
    {main.map(item => <button key={item.id} type="button" aria-current={item.active ? 'page' : undefined} onClick={() => open(item.id)}
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${item.active ? accent.text : 'text-ink-muted hover:text-ink'}`}>
      <Icon name={item.icon} className="size-5" /><span className={`max-w-full truncate text-[11px] ${item.active ? 'font-semibold' : ''}`}>{item.label}</span>
    </button>)}
    {more ? <><button type="button" aria-expanded={expanded} aria-controls={menuId} onClick={() => setExpanded(value => !value)}
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2.5 focus-visible:outline-2 focus-visible:outline-blue-500 ${expanded ? accent.text : 'text-ink-muted'}`}>
      <Icon name="more" className="size-5" /><span className="text-[11px]">Ещё</span>
    </button>
      {expanded ? <div id={menuId} role="dialog" aria-label="Все разделы" className="absolute inset-x-3 bottom-full z-30 mb-2 max-h-[75dvh] overflow-y-auto rounded-2xl border border-sand-200 bg-white p-2 shadow-soft">
        <div className="mb-3 flex items-center justify-between border-b border-sand-200 px-3 pb-2 pt-1"><p className="text-sm font-semibold">Все разделы</p>
          <button type="button" autoFocus aria-label="Закрыть меню разделов" onClick={() => setExpanded(false)} className="flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-sand-50 focus-visible:outline-2 focus-visible:outline-blue-500"><Icon name="plus" className="size-5 rotate-45" /></button></div>
        {groups.length ? <div className="space-y-4">{common.length ? <div className="border-b border-sand-200 pb-2">{common.map(row)}</div> : null}{groupedRows}</div> : tabs.slice(4).map(row)}
      </div> : null}
    </> : null}
  </nav>
}
