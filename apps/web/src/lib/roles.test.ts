import { test } from 'vitest'
import assert from 'node:assert/strict'
import { ROLE_LABELS, canAdminister, canEdit, isKnownRole } from './roles'

test('владелец и редактор могут писать, зритель — нет', () => {
  assert.equal(canEdit('owner'), true)
  assert.equal(canEdit('editor'), true)
  assert.equal(canEdit('viewer'), false)
})

test('неизвестная роль прав не даёт', () => {
  // Роль приходит из базы строкой: значение, которого мы не знаем,
  // не должно случайно получить права.
  assert.equal(canEdit('admin'), false)
  assert.equal(canEdit(''), false)
  assert.equal(canAdminister('editor'), false)
  assert.equal(isKnownRole('admin'), false)
})

test('управлять воркспейсом может только владелец', () => {
  assert.equal(canAdminister('owner'), true)
  assert.equal(canAdminister('viewer'), false)
})

test('у каждой известной роли есть человеческое название', () => {
  for (const role of Object.keys(ROLE_LABELS)) {
    assert.ok(isKnownRole(role))
    assert.ok(ROLE_LABELS[role as keyof typeof ROLE_LABELS].length > 0)
  }
})
