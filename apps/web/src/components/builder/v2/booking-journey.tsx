'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'

export type BookingIntent = { masterId?: string; day?: string; time?: string; client?: string; phone?: string; email?: string }
type Journey = { intent: BookingIntent | null; setIntent: (value: BookingIntent | null) => void; calendar: BookingIntent | null; setCalendar: (value: BookingIntent | null) => void }
const Context = createContext<Journey | null>(null)
export function BookingJourneyProvider({ children }: { children: ReactNode }) {
  const [intent, setIntent] = useState<BookingIntent | null>(null), [calendar, setCalendar] = useState<BookingIntent | null>(null)
  return <Context value={{ intent, setIntent, calendar, setCalendar }}>{children}</Context>
}
export const useBookingJourney = () => useContext(Context)
