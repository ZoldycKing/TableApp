// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { instantToWallClock } from '@tableapp/schema'
import type { TeamCalendarSnapshot } from '@/lib/team-calendar-core'
import { buildBookingV2App } from '@/lib/templates/booking-v2'
import { buildTemplate } from '@/lib/templates/build'
import { salon } from '@/lib/templates/defs/salon'
import { BookingCalendarDemoContext } from './booking-calendar'
import { BookingJourneyProvider } from './booking-journey'
import { BuilderV2TeamCalendar, TeamCalendarDemoContext } from './team-calendar'

vi.mock('@/app/builder-v2-form-actions', () => ({
  inspectBuilderV2FormAction: vi.fn(async () => ({ ok: false, error: 'Форма проверяется отдельно.' })),
  inspectWorkingBuilderV2FormAction: vi.fn(),
  submitBuilderV2FormAction: vi.fn(),
}))

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('new appointment from an empty slot', () => {
  it('opens the form dialog with the master and start time already shown', async () => {
    const now = new Date('2026-11-15T00:00:00Z')
    vi.spyOn(Date, 'now').mockReturnValue(now.getTime())
    const day = instantToWallClock(now, 'Europe/Moscow')!.date
    const built = buildTemplate({ template: salon, workspaceId: 'workspace_calendar' })
    const example = buildBookingV2App(built, { id: 'app_calendar', workspaceId: 'workspace_calendar', name: 'Календарь', slug: 'calendar-unit', email: 'owner@example.com' })
    const node = example.nodes.find(item => item.type === 'team_calendar')
    const screenNode = example.screens.find(item => node && item.rootIds.includes(node.id))
    if (node?.type !== 'team_calendar' || !screenNode) throw new Error('salon calendar')
    const data: TeamCalendarSnapshot = {
      timeZone: 'Europe/Moscow', days: [day], omitted: 0,
      resources: [{ id: 'master_olya', name: 'Оля' }],
      shifts: [{ resourceId: 'master_olya', day, windows: [{ id: 'morning', start: 540, end: 780 }], closed: false, exception: false }],
      events: [],
    }
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    render(
      <BookingJourneyProvider>
        <TeamCalendarDemoContext value={() => ({ ok: true, data })}>
          <BookingCalendarDemoContext value={() => ({ ok: true, data })}>
            <BuilderV2TeamCalendar
              app={example}
              node={node}
              screenId={screenNode.id}
              tables={[]}
              actor={{ authenticated: true, roleIds: ['owner'], id: 'user_owner', email: 'owner@example.com', name: 'Анна', company: '' }}
            />
          </BookingCalendarDemoContext>
        </TeamCalendarDemoContext>
      </BookingJourneyProvider>,
    )
    fireEvent.change(await screen.findByLabelText('Дата календаря'), { target: { value: day.split('-').reverse().join('.') } })
    fireEvent.click(await screen.findByRole('button', { name: `Добавить запись: Оля, ${day}, 09:00` }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая запись' })
    expect(dialog.textContent).toContain('Оля')
    expect(dialog.textContent).toContain('09:00')
    expect(dialog.textContent).toContain('15.11.2026')
    expect(dialog.querySelector('button[type="submit"]')).toBeTruthy()
  })
})
