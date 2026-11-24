// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { PhoneMockup, PHONE_MOCKUP } from './phone-mockup'

afterEach(cleanup)

it('renders a flush screen with status icons, dynamic island and home indicator', () => {
  const view = render(<PhoneMockup scheme="light"><div data-testid="screen">Контент</div></PhoneMockup>)
  const shell = view.container.querySelector('[data-phone-mockup]')
  expect(shell).toBeTruthy()
  expect(shell?.getAttribute('data-phone')).toBe('true')
  expect(shell?.getAttribute('data-scheme')).toBe('light')
  expect(view.getByText('9:41')).toBeTruthy()
  expect(view.getByTestId('screen').textContent).toBe('Контент')
  expect(view.container.querySelectorAll('svg')).toHaveLength(3)
  expect(PHONE_MOCKUP.bezel).toBeGreaterThanOrEqual(10)
  expect(PHONE_MOCKUP.bezel).toBeLessThanOrEqual(12)
})

it('keeps dark chassis styling available without changing children', () => {
  const view = render(<PhoneMockup scheme="dark" height={640}><span>Тёмная тема</span></PhoneMockup>)
  const shell = view.container.querySelector('[data-phone-mockup]') as HTMLElement
  expect(shell.getAttribute('data-scheme')).toBe('dark')
  expect(shell.style.height).toBe(`${640 + PHONE_MOCKUP.bezel * 2}px`)
  expect(view.getByText('Тёмная тема')).toBeTruthy()
})
