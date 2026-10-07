import { test } from 'vitest'
import assert from 'node:assert/strict'
import { positionBetween, positionSequence } from './position'

test('позиция между границами списка', () => {
  const first = positionBetween(null, null)
  assert.ok(first.length > 0)
  assert.ok(positionBetween(null, first) < first)
  assert.ok(positionBetween(first, null) > first)
})

test('позиция строго между соседями', () => {
  const a = positionBetween(null, null)
  const b = positionBetween(a, null)
  const mid = positionBetween(a, b)
  assert.ok(a < mid && mid < b, `${a} < ${mid} < ${b}`)
})

test('тысяча вставок в одну точку не ломает порядок', () => {
  let low = positionBetween(null, null)
  const high = positionBetween(low, null)
  const seen: string[] = []
  for (let i = 0; i < 1000; i++) {
    const next = positionBetween(low, high)
    assert.ok(low < next && next < high, `итерация ${i}: ${low} < ${next} < ${high}`)
    seen.push(next)
    low = next
  }
  assert.deepEqual(seen, [...seen].sort())
})

test('последовательность позиций возрастает', () => {
  const seq = positionSequence(50)
  assert.equal(seq.length, 50)
  assert.deepEqual(seq, [...seq].sort())
  assert.equal(new Set(seq).size, 50)
})

test('перестановка строки в начало и в конец', () => {
  const [a, b, c] = positionSequence(3) as [string, string, string]
  assert.ok(positionBetween(null, a) < a)
  assert.ok(positionBetween(c, null) > c)
  assert.ok(positionBetween(a, b) > a)
  assert.ok(positionBetween(a, b) < b)
})
