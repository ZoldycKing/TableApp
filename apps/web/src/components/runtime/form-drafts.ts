'use client'

import { useEffect, useRef, useState } from 'react'

const PREFIX = 'tableapp:form-drafts:'
const MAX_AGE = 24 * 60 * 60 * 1000
const MAX_SIZE = 500_000

type DraftState<T> = { scope: string | null; drafts: Record<string, T> }

/** Drafts belong to a verified person and one business/app, never to a shared device account. */
export function useFormDrafts<T>(scope: string | null, validate?: (value: unknown) => value is T) {
  const [state, setState] = useState<DraftState<T>>({ scope: null, drafts: {} })
  const active = useRef(scope)
  active.current = scope
  const validator = useRef(validate)
  validator.current = validate
  useEffect(() => {
    let drafts: Record<string, T> = {}
    if (scope) try {
      const raw = sessionStorage.getItem(`${PREFIX}${scope}`)
      if (raw && raw.length <= MAX_SIZE) {
        const saved = JSON.parse(raw)
        if (saved && typeof saved.savedAt === 'number' && Date.now() - saved.savedAt < MAX_AGE && saved.savedAt <= Date.now()
          && saved.drafts && typeof saved.drafts === 'object' && !Array.isArray(saved.drafts)) {
          drafts = Object.fromEntries(Object.entries(saved.drafts).filter(([, value]) => !validator.current || validator.current(value))) as Record<string, T>
        }
      }
    } catch { /* In-memory drafts work even when session storage is unavailable. */ }
    setState({ scope, drafts })
  }, [scope])

  const ready = state.scope === scope
  const drafts = ready ? state.drafts : {}
  const change = (id: string, value: T | null) => {
    const expectedScope = scope
    setState(current => {
      if (active.current !== expectedScope || current.scope !== expectedScope) return current
      const next = { ...current.drafts }
      if (value === null) delete next[id]
      else next[id] = value
      if (expectedScope) try {
        const saved = JSON.stringify({ savedAt: Date.now(), drafts: next })
        if (saved.length <= MAX_SIZE && Object.keys(next).length) sessionStorage.setItem(`${PREFIX}${expectedScope}`, saved)
        else sessionStorage.removeItem(`${PREFIX}${expectedScope}`)
      } catch { /* The current page still keeps the draft. */ }
      return { scope: expectedScope, drafts: next }
    })
  }
  return { ready, drafts, save: (id: string, value: T) => change(id, value), remove: (id: string) => change(id, null) }
}

export function clearFormDraftsForActor(actorId: string) {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX) && key.endsWith(`:${actorId}`)) sessionStorage.removeItem(key)
  } catch { /* Sign-out must not depend on browser storage. */ }
}
