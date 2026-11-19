/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DateMenu } from './booking-calendar'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('DateMenu initial month', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-19T12:00:00'))
  })

  it('opens on the current month when value is empty', () => {
    render(<DateMenu label="Срок задачи" value="" onValue={() => {}} />)
    fireEvent.click(screen.getByLabelText('Срок задачи'))
    expect(screen.getByRole('dialog', { name: 'Срок задачи' }).textContent).toMatch(/ноябрь\s+2026/i)
  })

  it('opens on the selected date month', () => {
    render(<DateMenu label="Срок задачи" value="2026-03-15" onValue={() => {}} />)
    fireEvent.click(screen.getByLabelText('Срок задачи'))
    expect(screen.getByRole('dialog', { name: 'Срок задачи' }).textContent).toMatch(/март\s+2026/i)
  })
})
