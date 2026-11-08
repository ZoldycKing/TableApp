// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublishedAppLink } from './published-app-link'

afterEach(cleanup)
describe('working link after publication', () => {
  it('opens the real runtime and lets the owner check access', () => {
    const access = vi.fn()
    render(<PublishedAppLink slug="sklad" onAccess={access} />)
    expect(screen.getByRole('link', { name: 'Открыть приложение' }).getAttribute('href')).toBe('/a/sklad')
    fireEvent.click(screen.getByRole('button', { name: 'Кто может войти' }))
    expect(access).toHaveBeenCalledOnce()
  })
  it('copies the full working URL with visible feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<PublishedAppLink slug="sklad" onAccess={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Ссылка скопирована'))
    expect(writeText).toHaveBeenCalledWith(new URL('/a/sklad', window.location.origin).href)
  })
  it('provides a useful fallback when clipboard access fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    render(<PublishedAppLink slug="sklad" onAccess={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('скопируйте адрес из браузера'))
    expect(screen.getByRole('link', { name: 'Открыть приложение' })).toBeTruthy()
  })
})
