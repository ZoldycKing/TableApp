'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createBusinessAction, navigateBusinessResourceAction } from '@/app/business-navigation-actions'
import type { BusinessNavigation, BusinessResourceDestination } from '@/lib/business-navigation-types'
import { ShellIcon } from './icons'
import type { ShellVariant } from './variant'

type Props = {
  businesses: BusinessNavigation[]
  activeWorkspaceId?: string
  pathname: string
  variant: ShellVariant
  mobile?: boolean
  onNavigate?: () => void
}

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-sage-400'
const ROW = `flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-wait disabled:opacity-50 ${FOCUS}`

function resourceIsActive(pathname: string, kind: 'table' | 'app', id: string) {
  const prefixes = kind === 'table' ? [`/t/${encodeURIComponent(id)}`, `/tables/${encodeURIComponent(id)}`] : [`/apps/${encodeURIComponent(id)}`]
  return prefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** The owner sees actual resources grouped by business; expanding a branch does not switch it. */
export function BusinessTree({ businesses, activeWorkspaceId, pathname, variant, mobile = false, onNavigate }: Props) {
  const activeId = businesses.find(business => business.workspaceId === activeWorkspaceId)?.workspaceId
    ?? businesses[0]?.workspaceId
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => activeId ? { [activeId]: true } : {})
  const [groups, setGroups] = useState<Record<string, boolean>>({})
  const [pendingWorkspace, setPendingWorkspace] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const nameInput = useRef<HTMLInputElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const restoreAddFocus = useRef(false)
  const inFlight = useRef(false)
  const treeId = useId()
  const pending = pendingWorkspace !== null

  useEffect(() => {
    if (activeId) setExpanded(previous => ({ ...previous, [activeId]: true }))
  }, [activeId])

  useEffect(() => {
    if (adding) nameInput.current?.focus()
    else if (restoreAddFocus.current) {
      restoreAddFocus.current = false
      addButton.current?.focus()
    }
  }, [adding])

  const finish = (href: string) => {
    onNavigate?.()
    // Switching business changes every server resource, so keep a full navigation.
    window.location.assign(href)
  }

  const go = async (workspaceId: string, destination: BusinessResourceDestination) => {
    if (inFlight.current) return
    inFlight.current = true
    setPendingWorkspace(workspaceId)
    setError(null)
    try {
      const result = await navigateBusinessResourceAction(workspaceId, destination)
      if (result.ok) finish(result.href)
      else setError(result.error)
    } catch {
      setError('Не удалось открыть раздел. Попробуйте ещё раз.')
    } finally {
      inFlight.current = false
      setPendingWorkspace(null)
    }
  }

  const closeAdd = () => {
    if (inFlight.current) return
    restoreAddFocus.current = true
    setAdding(false)
    setName('')
    setError(null)
  }

  const create = async () => {
    if (inFlight.current) return
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 100) {
      setError('Укажите название бизнеса от 1 до 100 символов')
      nameInput.current?.focus()
      return
    }
    inFlight.current = true
    setPendingWorkspace('new')
    setError(null)
    try {
      const result = await createBusinessAction(trimmed)
      if (result.ok) finish(result.href)
      else setError(result.error)
    } catch {
      setError('Не удалось создать бизнес. Попробуйте ещё раз.')
    } finally {
      inFlight.current = false
      setPendingWorkspace(null)
    }
  }

  const resourceGroups = (business: BusinessNavigation) => (
    <div className={mobile ? 'space-y-2' : 'ml-4 space-y-1 border-l border-sand-200 pl-2'}>
      {(['tables', 'apps'] as const).map(kind => {
        const tableGroup = kind === 'tables'
        const groupKey = `${business.workspaceId}-${kind}`
        const isOpen = groups[groupKey] !== false
        const label = tableGroup ? 'Таблицы' : 'Приложения'
        const resources = business[kind]
        const groupId = `${treeId}-${groupKey}`
        return (
          <div key={kind}>
            <button
              type="button"
              disabled={pending}
              aria-label={`${label}: ${business.businessName}`}
              aria-expanded={isOpen}
              aria-controls={groupId}
              onClick={() => setGroups(previous => ({ ...previous, [groupKey]: !isOpen }))}
              className={`${ROW} text-ink-soft hover:bg-sand-100 hover:text-ink`}
            >
              <ShellIcon name={tableGroup ? 'table' : 'apps'} className="size-4 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span aria-hidden="true" className="text-xs text-ink-muted">{resources.length}</span>
              <ShellIcon name="chevron" className={`size-3.5 shrink-0 text-ink-muted transition-transform ${isOpen ? '' : '-rotate-90'}`} />
            </button>
            {isOpen ? (
              <div id={groupId} className="ml-3 border-l border-sand-200 pl-2">
                {resources.length === 0 ? (
                  <p className="px-2 py-2 text-xs leading-5 text-ink-muted">
                    {tableGroup ? 'Таблиц пока нет' : 'Приложений пока нет'}
                  </p>
                ) : resources.map(resource => {
                  const active = business.workspaceId === activeId
                    && resourceIsActive(pathname, tableGroup ? 'table' : 'app', resource.id)
                  const app = !tableGroup ? business.apps.find(item => item.id === resource.id) : undefined
                  return (
                    <button
                      key={resource.id}
                      type="button"
                      disabled={pending}
                      aria-current={active ? 'page' : undefined}
                      title={app ? `${resource.name} — ${app.published ? 'опубликовано' : 'черновик'}` : resource.name}
                      onClick={() => void go(business.workspaceId, { kind: tableGroup ? 'table' : 'app', id: resource.id })}
                      className={`${ROW} ${active ? 'bg-sage-50 font-medium text-ink' : 'text-ink-soft hover:bg-sand-100 hover:text-ink'}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{resource.name}</span>
                      {app && !app.published ? <span aria-label="Черновик" title="Черновик" className="size-1.5 shrink-0 rounded-full bg-sand-300" /> : null}
                    </button>
                  )
                })}
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`${tableGroup ? 'Все таблицы' : 'Все приложения'}: ${business.businessName}`}
                  onClick={() => void go(business.workspaceId, { kind })}
                  className={`my-1 px-2 py-1.5 text-xs text-ink-muted transition-colors hover:text-sage-700 disabled:opacity-50 ${FOCUS}`}
                >
                  {tableGroup ? 'Все таблицы' : 'Все приложения'}
                </button>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )

  if (variant === 'rail' && !mobile) return null

  const activeBusiness = businesses.find(business => business.workspaceId === activeId)
  const ordered = [...businesses].sort((left, right) => Number(right.workspaceId === activeId) - Number(left.workspaceId === activeId))

  return (
    <nav aria-label="Бизнесы, таблицы и приложения" className="min-w-0 space-y-3" aria-busy={pending}>
      {mobile ? (
        <>
          <label htmlFor={`${treeId}-business`} className="block px-1 text-xs font-medium text-ink-muted">Бизнес</label>
          <select
            id={`${treeId}-business`}
            value={pendingWorkspace && pendingWorkspace !== 'new' ? pendingWorkspace : activeId ?? ''}
            disabled={pending || businesses.length === 0}
            onChange={event => { if (event.target.value !== activeId) void go(event.target.value, { kind: 'home' }) }}
            className={`w-full min-w-0 rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm text-ink disabled:opacity-50 ${FOCUS}`}
          >
            {businesses.length === 0 ? <option value="">Бизнесов пока нет</option> : null}
            {businesses.map(business => <option key={business.workspaceId} value={business.workspaceId}>{business.businessName}</option>)}
          </select>
          {pendingWorkspace && pendingWorkspace !== 'new' && pendingWorkspace !== activeId
            ? <p role="status" className="px-1 text-sm text-ink-muted">Открываем бизнес…</p>
            : activeBusiness ? resourceGroups(activeBusiness) : null}
        </>
      ) : (
        <>
          <p className="px-2 text-[11px] font-medium text-ink-muted">Мои бизнесы</p>
          <div className="space-y-2">
            {ordered.map(business => {
              const isOpen = expanded[business.workspaceId] === true
              const active = business.workspaceId === activeId
              const branchId = `${treeId}-${business.workspaceId}`
              return (
                <div key={business.workspaceId}>
                  <div className={`mb-1 flex min-w-0 items-center gap-0.5 rounded-lg ${active ? 'bg-sand-50' : ''}`}>
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`${isOpen ? 'Свернуть' : 'Развернуть'} разделы: ${business.businessName}`}
                    aria-expanded={isOpen}
                    aria-controls={branchId}
                    onClick={() => setExpanded(previous => ({ ...previous, [business.workspaceId]: !isOpen }))}
                    className={`flex min-h-10 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-sand-100 ${FOCUS}`}
                  >
                    <ShellIcon name="chevron" className={`size-3.5 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Бизнес: ${business.businessName}`}
                    aria-current={active && pathname === '/app' ? 'page' : undefined}
                    title={`Открыть обзор: ${business.businessName}`}
                    onClick={() => void go(business.workspaceId, { kind: 'home' })}
                    className={`${ROW} min-h-10 flex-1 font-medium ${active ? 'text-ink' : 'text-ink-soft'} hover:bg-sand-100`}
                  >
                    <span aria-hidden="true" className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${active ? 'bg-sage-50 text-sage-700' : 'bg-sand-100 text-ink-muted'}`}>
                      {(business.businessName.trim()[0] ?? 'Б').toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{business.businessName}</span>
                  </button>
                  </div>
                  {isOpen ? <div id={branchId}>{resourceGroups(business)}</div> : null}
                </div>
              )
            })}
            {businesses.length === 0 ? <p className="px-2 text-xs leading-5 text-ink-muted">Добавьте бизнес, чтобы создать его таблицы и приложение.</p> : null}
          </div>
        </>
      )}

      {adding ? (
        <form
          onSubmit={event => { event.preventDefault(); void create() }}
          onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeAdd() } }}
          className="space-y-2 rounded-xl bg-sand-50 p-2.5"
        >
          <label htmlFor={`${treeId}-name`} className="block text-xs font-medium text-ink-soft">Название бизнеса</label>
          <input
            ref={nameInput}
            id={`${treeId}-name`}
            value={name}
            onChange={event => setName(event.target.value)}
            disabled={pending}
            maxLength={100}
            placeholder="Например, ООО «Ромашка»"
            autoComplete="organization"
            className={`w-full min-w-0 rounded-lg border border-sand-200 bg-white px-2.5 py-2 text-sm text-ink disabled:opacity-50 ${FOCUS}`}
          />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className={`rounded-lg bg-sage-700 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-sage-800 disabled:opacity-50 ${FOCUS}`}>
              {pendingWorkspace === 'new' ? 'Создаём…' : 'Создать'}
            </button>
            <button type="button" disabled={pending} onClick={closeAdd} className={`rounded-lg px-2 py-2 text-xs text-ink-soft hover:bg-sand-100 disabled:opacity-50 ${FOCUS}`}>Отмена</button>
          </div>
        </form>
      ) : (
        <button
          ref={addButton}
          type="button"
          disabled={pending}
          onClick={() => { setAdding(true); setError(null) }}
          className={`${ROW} text-ink-muted hover:bg-sand-100 hover:text-ink`}
        >
          <ShellIcon name="plus" className="size-4 shrink-0" />
          <span>Добавить бизнес</span>
        </button>
      )}
      {error ? <p role="alert" className="px-2 text-xs leading-5 text-red-700">{error}</p> : null}
    </nav>
  )
}
