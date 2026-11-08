'use client'
import { useEffect, useRef, useState } from 'react'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { readBuilderV2RecordAction } from '@/app/builder-v2-data-actions'
import { builderV2ScreenNodes, type BuilderV2DataRecord } from '@/lib/builder-v2-data-types'
import type { BuilderLearningProgress } from '@/lib/builder-learning-types'

type State = { key: string; loading: boolean; record?: BuilderV2DataRecord; title?: string; error: string; learning?: BuilderLearningProgress; learningError?: string }
export function useBuilderV2Record(app: AppV2, screenId: string, recordId?: string) {
  const screen = app.screens.find(screen => screen.id === screenId)
  const key = JSON.stringify([app.id, screenId, screen?.contextTableId, screen?.catalog, recordId, builderV2ScreenNodes(app, screenId)])
  const enabled = Boolean(screen?.contextTableId && recordId), generation = useRef(0), current = useRef(app); current.current = app
  const [refresh, setRefresh] = useState(0), [state, setState] = useState<State>({ key: '', loading: false, error: '' })
  useEffect(() => {
    const version = ++generation.current
    if (!enabled) return
    setState({ key, loading: true, error: '' })
    const timer = setTimeout(async () => {
      try {
        const app = current.current, result = await readBuilderV2RecordAction(app.id, app, { screenId, recordId: recordId! })
        if (version !== generation.current) return
        setState(result.ok ? { key, loading: false, record: result.record, title: result.title, error: '', learning: result.learning, learningError: result.learningError } : { key, loading: false, error: result.error })
      } catch { if (version === generation.current) setState({ key, loading: false, error: 'Не удалось загрузить запись. Попробуйте ещё раз.' }) }
    }, 100)
    return () => { clearTimeout(timer); generation.current++ }
  }, [key, enabled, refresh, screenId, recordId])
  return { ...(state.key === key && enabled ? state : { key, loading: enabled, error: '' }), retry: () => setRefresh(value => value + 1) }
}
