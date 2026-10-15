import { describe, expect, it } from 'vitest'
import { parseGeneralQuestionDraft } from './general-question-draft'

const key = 'tableapp:question:business:app'
const draft = { key, body: 'Можно выбрать другую длину?', requestId: 'c1713775-4c54-49a6-8a94-4fdb887bc141', ownerId: null, active: true, login: true }
describe('general question draft boundaries', () => {
  it('keeps a guest question and retry key after verified login, without sending it', () => {
    expect(parseGeneralQuestionDraft(JSON.stringify(draft), key, 'client-1')).toEqual({ ...draft, ownerId: 'client-1', login: false })
  })
  it('does not share text with another business, person or signed-out session', () => {
    expect(parseGeneralQuestionDraft(JSON.stringify(draft), 'another-business', null)).toBeNull()
    const personal = JSON.stringify({ ...draft, ownerId: 'client-1' })
    expect(parseGeneralQuestionDraft(personal, key, 'client-2')).toBeNull()
    expect(parseGeneralQuestionDraft(personal, key, null)).toBeNull()
  })
  it('discards damaged or oversized storage values', () => {
    for (const value of ['broken', 'null', JSON.stringify({ ...draft, body: 'x'.repeat(4001) }), JSON.stringify({ ...draft, requestId: 'not-a-request' })]) {
      expect(parseGeneralQuestionDraft(value, key, null)).toBeNull()
    }
  })
})
