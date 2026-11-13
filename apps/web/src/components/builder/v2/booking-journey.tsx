'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'

export type BookingIntent = { masterId?: string; day?: string; time?: string; clientId?: string; client?: string; phone?: string; email?: string }
type CalendarState = { day?: string; masterId?: string; week?: boolean }
type Journey = { intent: BookingIntent | null; setIntent: (value: BookingIntent | null) => void; calendar: CalendarState | null; setCalendar: (value: CalendarState | null) => void }
const Context = createContext<Journey | null>(null)
export function BookingJourneyProvider({ children }: { children: ReactNode }) {
  const [intent, setIntent] = useState<BookingIntent | null>(null), [calendar, setCalendar] = useState<CalendarState | null>(null)
  return <Context value={{ intent, setIntent, calendar, setCalendar }}>{children}</Context>
}
export const useBookingJourney = () => useContext(Context)
