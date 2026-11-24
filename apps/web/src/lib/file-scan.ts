import { connect as netConnect, type Socket } from 'node:net'
import type { ScanStatus } from './file-policy'

export type ScanResult =
  | { status: 'clean' | 'skipped' }
  | { status: 'infected'; signature: string }

type ClamConfig = { host: string; port: number } | { socket: string } | null

/** Parse CLAMAV_HOST (host:port or host), CLAMAV_PORT, or CLAMAV_SOCKET. Empty → scanning disabled. */
export function clamConfig(env: Record<string, string | undefined> = process.env): ClamConfig {
  const socket = env.CLAMAV_SOCKET?.trim()
  if (socket) return { socket }
  const hostRaw = env.CLAMAV_HOST?.trim()
  if (!hostRaw) return null
  if (hostRaw.includes(':') && !hostRaw.startsWith('/')) {
    const [host, portText] = hostRaw.split(':')
    const port = Number(portText)
    if (!host || !Number.isFinite(port) || port <= 0) return null
    return { host, port }
  }
  const port = Number(env.CLAMAV_PORT ?? '3310')
  if (!Number.isFinite(port) || port <= 0) return null
  return { host: hostRaw, port }
}

function connect(config: Exclude<ClamConfig, null>, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = 'socket' in config
      ? netConnect(config.socket)
      : netConnect({ host: config.host, port: config.port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('ClamAV connection timed out'))
    }, timeoutMs)
    socket.once('connect', () => { clearTimeout(timer); resolve(socket) })
    socket.once('error', (error) => { clearTimeout(timer); reject(error) })
  })
}

function readResponse(socket: Socket, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('ClamAV response timed out'))
    }, timeoutMs)
    socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    socket.once('end', () => {
      clearTimeout(timer)
      resolve(Buffer.concat(chunks).toString('utf8').trim())
    })
    socket.once('error', (error) => { clearTimeout(timer); reject(error) })
  })
}

/**
 * Scan bytes with clamd INSTREAM. Never throws to callers of scanUpload:
 * misconfiguration and transport errors become skipped with a warning.
 */
export async function scanWithClamd(bytes: Uint8Array, config: Exclude<ClamConfig, null>, timeoutMs = 30_000): Promise<ScanResult> {
  const socket = await connect(config, Math.min(10_000, timeoutMs))
  const response = readResponse(socket, timeoutMs)
  socket.write('zINSTREAM\0')
  const chunkSize = 64 * 1024
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize)
    const header = Buffer.alloc(4)
    header.writeUInt32BE(slice.byteLength, 0)
    socket.write(header)
    socket.write(Buffer.from(slice))
  }
  socket.write(Buffer.alloc(4)) // zero-size chunk ends the stream
  const text = (await response).replace(/\0+$/g, '').trim()
  if (/^stream:\s*OK$/i.test(text) || /^OK$/i.test(text)) return { status: 'clean' }
  const infected = text.match(/^stream:\s*(.+)\s+FOUND$/i)
  if (infected) return { status: 'infected', signature: infected[1]!.trim() }
  throw new Error(`Unexpected ClamAV response: ${text.slice(0, 200)}`)
}

let warnedMissing = false

export async function scanUpload(bytes: Uint8Array): Promise<ScanResult> {
  const config = clamConfig()
  if (!config) {
    if (!warnedMissing) {
      warnedMissing = true
      console.warn('[files] ClamAV is not configured (CLAMAV_HOST / CLAMAV_SOCKET). Virus scanning is skipped.')
    }
    return { status: 'skipped' }
  }
  try {
    return await scanWithClamd(bytes, config)
  } catch (error) {
    console.warn('[files] ClamAV scan failed; treating upload as unscanned.', error instanceof Error ? error.message : error)
    return { status: 'skipped' }
  }
}

export function scanStatusLabel(status: ScanStatus): string {
  if (status === 'pending') return 'Проверяется'
  if (status === 'infected') return 'Файл заблокирован'
  return ''
}

/** Reset the one-time missing-config warning (tests). */
export function resetScanWarning(): void {
  warnedMissing = false
}
