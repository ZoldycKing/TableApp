'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RuntimeApp } from './app-runtime'

export function useScreenRuntime(initial: RuntimeApp, screenId: string, disabled: boolean) {
  const { refresh } = useRouter()
  const [slice, setSlice] = useState<{ base: RuntimeApp; runtime: RuntimeApp }>({ base: initial, runtime: initial })
  const [failure, setFailure] = useState<{ base: RuntimeApp; screenId: string; error: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const runtime = slice.base === initial ? slice.runtime : initial
  const loading = !disabled && Boolean(runtime.lazy && !runtime.lazy.loadedScreenIds.includes(screenId))
  const error = failure?.base === initial && failure.screenId === screenId ? failure.error : null
  useEffect(() => {
    if (!loading || !initial.lazy) return
    let current = true
    setFailure(null)
    import('@/app/runtime-screen-actions').then(({ loadRuntimeScreenAction }) => loadRuntimeScreenAction(initial.app.slug, screenId, initial.lazy!.revision)).then(result => {
      if (!current) return
      if (result.ok) setSlice({ base: initial, runtime: result.runtime })
      else { setFailure({ base: initial, screenId, error: result.error }); if (result.reload) refresh() }
    }).catch(() => { if (current) setFailure({ base: initial, screenId, error: 'Не удалось загрузить раздел. Проверьте соединение и попробуйте ещё раз.' }) })
    return () => { current = false }
  }, [initial, screenId, loading, attempt, refresh])
  return { runtime, loading, error, retry: () => setAttempt(value => value + 1) }
}
