import { expect, it } from 'vitest'
import { COLORS } from '@tableapp/schema'
import { accentTones } from './ui'

it('renders every accent offered by the editor without falling back to blue', () => {
  expect(new Set(COLORS.map(color => accentTones(color).solid)).size).toBe(COLORS.length)
  expect(accentTones('cyan').text).toBe('text-cyan-700')
  expect(accentTones('orange').solid).toBe('bg-orange-700')
  expect(accentTones('unknown')).toEqual(accentTones('blue'))
})
