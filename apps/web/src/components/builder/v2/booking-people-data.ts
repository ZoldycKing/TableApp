'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import type { AppV2 } from '@tableapp/schema/app-v2'
import type { BookingTeamResult } from '@/lib/builder-v2-booking-people'
import { usePublishedV2 } from './published-context'
export const BookingPeopleDemoContext = createContext<((screenId: string) => BookingTeamResult) | null>(null)
export function useBookingPeople(app: AppV2, screenId: string) {
  const demo = useContext(BookingPeopleDemoContext), published = usePublishedV2()
  const [attempt, setAttempt] = useState(0), [state, setState] = useState<{ key: string; result: BookingTeamResult }>()
  const key = JSON.stringify([app, screenId, published?.revision, published?.dataVersion, attempt])
  useEffect(() => {
    let cancelled = false
    const read = async () => {
      if (demo) return demo(screenId)
      const actions = await import('@/app/builder-v2-booking-people-actions')
      return published ? actions.readPublishedV2BookingPeopleAction(published.slug, screenId, published.revision) : actions.readBuilderV2BookingPeopleAction(app.id, app, screenId)
    }
    void read().then(result => { if (!cancelled) setState({ key, result }) }).catch(() => { if (!cancelled) setState({ key, result: { ok: false, error: 'Не удалось загрузить данные. Попробуйте ещё раз.' } }) })
    return () => { cancelled = true }
  }, [key])
  return { result: state?.key === key ? state.result : undefined, retry: () => setAttempt(value => value + 1) }
}
