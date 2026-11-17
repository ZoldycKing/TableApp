'use client'
import { groupBookingSlots, type BookingSlot } from '@/lib/booking'
import css from './booking.module.css'

export const BOOKING_NO_FREE_TIME = 'На эту дату свободного времени нет. Выберите другую дату.'

/** Compact time chips shared by the owner form, client booking and reschedule. */
export function BookingSlotList({ slots, masterId = '', selectedStart, selectedMasterId, onSelect }: {
  slots: readonly BookingSlot[]
  /** Empty means «Любой свободный»: one chip per start time. */
  masterId?: string
  selectedStart: string | null
  selectedMasterId: string | null
  onSelect: (slot: BookingSlot) => void
}) {
  const anyMaster = !masterId
  const groups = groupBookingSlots(slots, masterId)
  if (!groups.length) return <p role="status" className={css.slotEmpty}>{BOOKING_NO_FREE_TIME}</p>
  return <div className={css.slotGroups}>
    {groups.map(group => <div key={group.id} className={css.slotGroup}>
      <h4>{group.title}</h4>
      <div className={css.slotChips} role="group" aria-label={group.title}>
        {group.slots.map(slot => {
          const pressed = selectedStart === slot.start && (anyMaster || selectedMasterId === slot.masterId)
          return <button key={anyMaster ? slot.start : `${slot.start}:${slot.masterId}`} type="button" aria-pressed={pressed} onClick={() => onSelect(slot)}>{slot.time}</button>
        })}
      </div>
    </div>)}
  </div>
}
