import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { RowWriteError } from './row-mutations'

// Short-lived navigation state. No candidate IDs or hidden dates leave the server in plaintext.
const key = randomBytes(32)
export function historyCursor(value: unknown, binding: string): string {
  const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(binding))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ value, expires: Date.now() + 1_800_000 }), 'utf8'), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url')
}
export function readHistoryCursor(token: string | undefined, binding: string): unknown {
  if (token === undefined) return null
  try {
    if (typeof token !== 'string' || token.length > 2000 || !/^[\w-]+$/.test(token)) throw new Error()
    const bytes = Buffer.from(token, 'base64url')
    if (bytes.toString('base64url') !== token) throw new Error()
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
    decipher.setAAD(Buffer.from(binding)); decipher.setAuthTag(bytes.subarray(12, 28))
    const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString())
    if (!Number.isFinite(data.expires) || data.expires < Date.now()) throw new Error()
    return data.value
  } catch { throw new RowWriteError('conflict', 'Страница истории устарела. Обновите список и повторите действие.') }
}
