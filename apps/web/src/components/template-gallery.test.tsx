// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
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
    expect(ui.getByRole('button', { name: 'Для команды' }).getAttribute('aria-pressed')).toBe('true')
    expect(ui.getByRole('heading', { name: 'Склад и остатки' })).toBeTruthy()
    expect(ui.queryByRole('heading', { name: 'Продажа товаров' })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Для клиентов' }))
    expect(ui.getByRole('heading', { name: 'Продажа товаров' })).toBeTruthy()
    expect(ui.queryByRole('heading', { name: 'Клиентский портал' })).toBeNull()
    expect(ui.queryByRole('heading', { name: 'Каталог для менеджера' })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Для команды' }))
    expect(ui.getByRole('heading', { name: 'Склад и остатки' })).toBeTruthy()
  })

  it('creates only one sales app on double click and opens its preview', async () => {
    let resolve!: (result: unknown) => void
    mocks.apply.mockReturnValue(new Promise(result => { resolve = result }))
    const ui = render(<TemplateGallery templates={[...STARTER_TEMPLATES]} chosen="zakazy" />)
    const button = ui.getByRole('button', { name: 'Начать настройку «Продажа товаров»' })
    fireEvent.click(button); fireEvent.click(button)
    expect(mocks.apply).toHaveBeenCalledOnce()
    expect(mocks.apply).toHaveBeenCalledWith('zakazy')
    resolve({ ok: true, tableId: 'table-new', appId: 'app-new' })
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/setup?app=app-new&step=review'))
  })

  it('preserves an explicitly selected old portal outside the main choice', () => {
    const ui = render(<TemplateGallery templates={[...STARTER_TEMPLATES]} compatibilityTemplate={findTemplate('portal')} />)
    expect(ui.getByText(/Вы открыли прежний набор/)).toBeTruthy()
    expect(ui.getByRole('button', { name: 'Продолжить с шаблоном «Клиентский портал»' })).toBeTruthy()
    expect(ui.queryByRole('heading', { name: 'Клиентский портал' })).toBeNull()
  })

  it('keeps the scenario available after a failed request instead of leaving every button locked', async () => {
    mocks.apply.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, appId: 'retry-app' })
    const ui = render(<TemplateGallery templates={[...STARTER_TEMPLATES]} />)
    fireEvent.click(ui.getByRole('button', { name: 'Посмотреть шаблон «Салон красоты»' }))
    const card = within(ui.getByRole('article', { name: 'Салон красоты' }))
    fireEvent.click(card.getByRole('button', { name: 'Начать настройку «Салон красоты»' }))
    expect((await card.findByRole('alert')).textContent).toContain('Не удалось подготовить шаблон')
    fireEvent.click(card.getByRole('button', { name: 'Начать настройку «Салон красоты»' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/setup?app=retry-app&step=business'))
  })

  it('locks other choices until a direct card request finishes', async () => {
    let resolve!: (result: unknown) => void
    mocks.apply.mockReturnValue(new Promise(result => { resolve = result }))
    const ui = render(<TemplateGallery templates={[...STARTER_TEMPLATES]} />)
    fireEvent.click(ui.getByRole('button', { name: 'Посмотреть шаблон «Доставка»' }))
    fireEvent.click(ui.getByRole('button', { name: 'Начать настройку «Доставка»' }))
    expect(ui.getByRole('button', { name: 'Для команды' }).hasAttribute('disabled')).toBe(true)
    expect(ui.getByRole('combobox', { name: 'Выберите задачу' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(ui.getByRole('button', { name: 'Посмотреть шаблон «Салон красоты»' }))
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith('dostavka')
    resolve({ ok: false, error: 'Нет соединения. Попробуйте ещё раз.' })
    await waitFor(() => expect(ui.getByRole('button', { name: 'Для команды' }).hasAttribute('disabled')).toBe(false))
    expect(within(ui.getByRole('article', { name: 'Доставка' })).getByRole('alert').textContent).toContain('Нет соединения')
  })

  it('previews and switches templates without creating data until setup is started', async () => {
    mocks.apply.mockResolvedValue({ ok: true, appId: 'service-app' })
    const ui = render(<TemplateGallery templates={[...STARTER_TEMPLATES]} />)
    fireEvent.click(ui.getByRole('button', { name: 'Посмотреть шаблон «Салон красоты»' }))
    expect(ui.getByRole('article', { name: 'Салон красоты' })).toBeTruthy()
    expect(ui.queryByRole('article', { name: 'Продажа товаров' })).toBeNull()
    fireEvent.change(ui.getByRole('combobox', { name: 'Выберите задачу' }), { target: { value: 'service' } })
    expect(ui.getByRole('article', { name: 'Сервисный центр' })).toBeTruthy()
    expect(mocks.apply).not.toHaveBeenCalled()
    fireEvent.click(ui.getByRole('button', { name: 'Начать настройку «Сервисный центр»' }))
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith('service')
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/setup?app=service-app&step=business'))
  })
})
