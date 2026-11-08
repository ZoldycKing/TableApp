'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { builderLearningAction, readBuilderLearningAction, confirmBuilderLearningAccessAction } from '@/app/builder-learning-actions'
import type { BuilderLearningIntent, BuilderLearningProgress } from '@/lib/builder-learning-types'

export function useBuilderLearning(appId: string, initial: BuilderLearningProgress | null, autoStart: boolean, enabled: boolean) {
  const [progress, setProgress] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const generation = useRef(0), lock = useRef(false)
  const seeded = useRef(Boolean(initial))
  const lastAccess=useRef<string|null>(null)
  const lastIntent = useRef<BuilderLearningIntent>('start')
  const apply = useCallback((next?: BuilderLearningProgress) => {
    if (!next) return
    setProgress(current => !current || current.revision <= next.revision ? next : current)
  }, [])
  const perform = useCallback(async (intent: BuilderLearningIntent) => {
    if (lock.current || !enabled) return false
    lastAccess.current=null;lastIntent.current = intent
    const current = generation.current
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await builderLearningAction(appId, intent)
      if (current !== generation.current) return false
      if (!result.ok) { setError(result.error); return false }
      if (result.progress) apply(result.progress)
      return true
    } catch { if (current === generation.current) setError('Не удалось сохранить прогресс. Попробуйте ещё раз.'); return false }
    finally { if (current === generation.current) { lock.current = false; setBusy(false) } }
  }, [appId, enabled, apply])
  const confirmAccess=useCallback(async(revision:string)=>{
    if(lock.current||!enabled)return false
    lastAccess.current=revision;const current=generation.current
    lock.current=true;setBusy(true);setError('')
    try{const result=await confirmBuilderLearningAccessAction(appId,revision);if(current!==generation.current)return false;if(!result.ok){setError(result.error);return false}if(result.progress)apply(result.progress);return true}
    catch{if(current===generation.current)setError('Не удалось подтвердить проверку доступа. Повторите попытку.');return false}
    finally{if(current===generation.current){lock.current=false;setBusy(false)}}
  },[appId,enabled,apply])
  const refresh = useCallback(async () => {
    const current = generation.current
    try { const result = await readBuilderLearningAction(appId); if (current === generation.current && result.ok && result.progress) apply(result.progress) }
    catch { /* A later authenticated save/read also refreshes progress. */ }
  }, [appId, apply])
  useEffect(() => {
    const timer = autoStart && enabled && !seeded.current ? setTimeout(() => void perform('start'), 0) : null
    const focus = () => { if (enabled) void refresh() }
    window.addEventListener('focus', focus)
    return () => { if (timer !== null) clearTimeout(timer); generation.current++; lock.current = false; window.removeEventListener('focus', focus) }
  }, [appId, enabled, autoStart, perform, refresh])
  return { progress, busy, error, setError, apply, perform, confirmAccess, retry: () => lastAccess.current?confirmAccess(lastAccess.current):perform(lastIntent.current), loading: autoStart && enabled && !progress && !error }
}
