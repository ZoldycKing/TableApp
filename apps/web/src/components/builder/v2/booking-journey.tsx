'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { AppV2Json } from '@tableapp/schema/app-v2'

export type BookingIntent = { masterId?: string; day?: string; time?: string; clientId?: string; client?: string; phone?: string; email?: string }
type CalendarState = { day?: string; masterId?: string; week?: boolean; key?: string }
type CalendarForm = { screenId: string; tableId: string; values: Record<string,AppV2Json> }
type Journey = { intent: BookingIntent | null; setIntent: (value: BookingIntent | null) => void; calendar: CalendarState | null; setCalendar: (value: CalendarState | null) => void; calendarForm: CalendarForm | null; setCalendarForm: (value: CalendarForm | null) => void }
const Context = createContext<Journey | null>(null)
export function BookingJourneyProvider({ children }: { children: ReactNode }) {
  const [intent, setIntent] = useState<BookingIntent | null>(null), [calendar, setCalendar] = useState<CalendarState | null>(null)
  const [calendarForm,setCalendarForm]=useState<CalendarForm|null>(null)
  return <Context value={{ intent, setIntent, calendar, setCalendar, calendarForm, setCalendarForm }}>{children}</Context>
}
export const useBookingJourney = () => useContext(Context)
