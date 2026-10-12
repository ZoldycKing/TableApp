// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findTemplate, STARTER_TEMPLATES } from '@/lib/templates/catalog'
import { TemplateGallery } from './template-gallery'

const mocks = vi.hoisted(() => ({ apply: vi.fn(), push: vi.fn() }))
vi.mock('@/app/template-actions', () => ({ applyTemplateAction: mocks.apply }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('starter choice', () => {
  it('separates customer scenarios from internal tools and restores an internal choice after login', () => {
    const ui = render(<TemplateGallery templates={[...STARTER_TEMPLATES]} chosen="sklad" />)
    expect(ui.getByRole('button', { name: 'Внутренний учёт' }).getAttribute('aria-pressed')).toBe('true')
    expect(ui.getByRole('heading', { name: 'Склад и остатки' })).toBeTruthy()
    expect(ui.queryByRole('heading', { name: 'Продажа товаров' })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Приложение для клиентов' }))
    expect(ui.getByRole('heading', { name: 'Продажа товаров' })).toBeTruthy()
    expect(ui.queryByRole('heading', { name: 'Клиентский портал' })).toBeNull()
    expect(ui.queryByRole('heading', { name: 'Каталог для менеджера' })).toBeNull()
  })

  it('creates only one sales app on double click and opens its configuration', async () => {
    let resolve!: (result: unknown) => void
    mocks.apply.mockReturnValue(new Promise(result => { resolve = result }))
    const ui = render(<TemplateGallery templates={[...STARTER_TEMPLATES]} chosen="zakazy" />)
    const button = ui.getByRole('button', { name: 'Поставить «Продажа товаров»' })
    fireEvent.click(button); fireEvent.click(button)
    expect(mocks.apply).toHaveBeenCalledOnce()
    expect(mocks.apply).toHaveBeenCalledWith('zakazy')
    resolve({ ok: true, tableId: 'table-new', appId: 'app-new' })
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/apps/app-new'))
  })

  it('preserves an explicitly selected old portal outside the main choice', () => {
    const ui = render(<TemplateGallery templates={[...STARTER_TEMPLATES]} compatibilityTemplate={findTemplate('portal')} />)
    expect(ui.getByText(/Вы открыли прежний набор/)).toBeTruthy()
    expect(ui.getByRole('button', { name: 'Поставить «Клиентский портал»' })).toBeTruthy()
    expect(ui.queryByRole('heading', { name: 'Клиентский портал' })).toBeNull()
  })
})
