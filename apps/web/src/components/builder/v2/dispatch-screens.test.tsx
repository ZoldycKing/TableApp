// @vitest-environment jsdom
vi.hoisted(() => { process.env.DATABASE_URL ??= 'postgres://tableapp:tableapp@127.0.0.1:5433/tableapp' })
vi.mock('@/app/builder-v2-data-actions', () => ({ readBuilderV2DataAction: vi.fn(), readBuilderV2RecordAction: vi.fn() }))
vi.mock('@/app/team-calendar-actions', () => ({ readBuilderTeamCalendarAction: vi.fn(), readPublishedTeamCalendarAction: vi.fn(), moveBuilderTeamCalendarAction: vi.fn(), movePublishedTeamCalendarAction: vi.fn() }))
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DispatchDemo } from './dispatch-demo'

describe('field service screens', () => {
  it('filters the dispatcher list from the overdue, today and unassigned counters', async () => {
    render(<DispatchDemo view="overview" bare />)
    const unassigned = await waitFor(() => screen.getByRole('button', { name: /Не назначено/ }))
    expect(unassigned.textContent).toContain('3')
    fireEvent.click(unassigned)
    expect(screen.getByRole('button', { name: /Протечка в подвале/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Замена циркуляционного насоса/ })).toBeNull()
    fireEvent.click(within(screen.getByRole('group', { name: 'Сводка заявок' })).getByRole('button', { name: /Просрочено/ }))
    expect(screen.getByRole('button', { name: /Замена циркуляционного насоса/ })).toBeTruthy()
    expect(screen.getAllByText('Просрочено').length).toBeGreaterThan(0)
  })
})
