import { expect, it } from 'vitest'
import { COLORS } from '@tableapp/schema'
import { accentTones } from './ui'
import { accentClasses } from './bindings'

it('renders every accent offered by the editor without falling back to blue', () => {
  expect(new Set(COLORS.map(color => accentTones(color).solid)).size).toBe(COLORS.length)
  expect(accentTones('cyan').text).toBe('text-cyan-700')
  expect(accentTones('orange').solid).toBe('bg-orange-700')
  expect(accentTones('unknown')).toEqual(accentTones('green'))
  for (const color of COLORS) {
    const tone = accentTones(color)
    expect(accentClasses(color)).toEqual({ bg: tone.solid, text: tone.text, ring: tone.ring })
  }
})
