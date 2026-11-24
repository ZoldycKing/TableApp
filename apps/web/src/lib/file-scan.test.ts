import { createServer, type AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clamConfig, resetScanWarning, scanUpload, scanWithClamd } from './file-scan'

afterEach(() => {
  resetScanWarning()
  vi.unstubAllEnvs()
})

describe('clamd configuration', () => {
  it('is disabled when env is empty', () => {
    expect(clamConfig({})).toBeNull()
  })
  it('parses host, host:port and unix socket', () => {
    expect(clamConfig({ CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: '3310' })).toEqual({ host: '127.0.0.1', port: 3310 })
    expect(clamConfig({ CLAMAV_HOST: 'clamav:3310' })).toEqual({ host: 'clamav', port: 3310 })
    expect(clamConfig({ CLAMAV_SOCKET: '/var/run/clamav/clamd.ctl' })).toEqual({ socket: '/var/run/clamav/clamd.ctl' })
  })
})

describe('clamd INSTREAM protocol', () => {
  it('reports clean and infected responses from a mock clamd', async () => {
    const server = createServer((socket) => {
      const chunks: Buffer[] = []
      socket.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk))
        const data = Buffer.concat(chunks)
        if (!data.includes(Buffer.alloc(4))) return
        const payload = data.toString('latin1')
        socket.end(payload.includes('Eicar') ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      await expect(scanWithClamd(Buffer.from('clean-bytes'), { host: '127.0.0.1', port })).resolves.toEqual({ status: 'clean' })
      await expect(scanWithClamd(Buffer.from('Eicar-Test'), { host: '127.0.0.1', port })).resolves.toEqual({
        status: 'infected',
        signature: 'Eicar-Test-Signature',
      })
    } finally {
      server.close()
    }
  })

  it('skips scanning with a warning when ClamAV is not configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('CLAMAV_HOST', '')
    vi.stubEnv('CLAMAV_SOCKET', '')
    await expect(scanUpload(Buffer.from('x'))).resolves.toEqual({ status: 'skipped' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ClamAV is not configured'))
    warn.mockRestore()
  })

  it('skips scanning without crashing when clamd is unreachable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('CLAMAV_HOST', '127.0.0.1')
    vi.stubEnv('CLAMAV_PORT', '1')
    await expect(scanUpload(Buffer.from('x'))).resolves.toEqual({ status: 'skipped' })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
