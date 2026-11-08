import { expect, it } from 'vitest'
import { LEGACY_PRODUCTION_CANCEL_WARNING, PRODUCTION_CANCEL_WARNING, productionCancellationCopy } from './production-copy'

it('updates generated cancellation guidance without changing custom explanations', () => {
  expect(productionCancellationCopy(LEGACY_PRODUCTION_CANCEL_WARNING, false)).toBe(PRODUCTION_CANCEL_WARNING)
  expect(productionCancellationCopy(LEGACY_PRODUCTION_CANCEL_WARNING, true)).toContain('Готовая продукция этого выпуска будет убрана со склада.')
  expect(productionCancellationCopy('Наш порядок отмены', true)).toBe('Наш порядок отмены')
})
