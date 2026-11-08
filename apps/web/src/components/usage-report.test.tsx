// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLANS } from '@tableapp/schema'
import { UsageReport } from './usage-report'

vi.mock('@/app/usage-actions', () => ({ recountUsageAction: vi.fn() }))
afterEach(cleanup)
const usage = { rows:25, tables:5, publishedApps:1, fileBytes:0, appUsers:0, countedAt:'2026-10-26T00:00:00Z' }

describe('usage limits without false alarms', () => {
  it('explains a full application allowance without suggesting the live app stopped', () => {
    render(<UsageReport plan={PLANS.free} usage={usage} byTable={[]} canRecount={false} />)
    expect(screen.getByText(/Опубликовано 1 из 1/).textContent).toContain('Текущие приложения продолжают работать')
    expect(screen.queryByText(/Место кончилось/)).toBeNull()
    expect(screen.getByRole('progressbar', {name:'Опубликованные приложения'}).getAttribute('aria-valuenow')).toBe('100')
  })
  it('still explains actual row overflow and the reserve', () => {
    render(<UsageReport plan={PLANS.free} usage={{...usage,rows:2100}} byTable={[]} canRecount={false} />)
    expect(screen.getByRole('heading', {name:'Строки закончились'})).toBeTruthy()
    expect(screen.getByText(/Добавлять строки вручную и загружать файлы с данными сейчас нельзя/)).toBeTruthy()
    expect(screen.getByRole('progressbar', {name:'Строки'}).getAttribute('aria-valuenow')).toBe('100')
    expect(screen.getByRole('progressbar', {name:'Строки'}).getAttribute('aria-valuetext')).toContain('2')
  })
})
