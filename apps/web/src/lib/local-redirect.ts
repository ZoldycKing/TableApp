import { safeNext } from './safe-next'

/** Relative Location preserves the browser's origin behind Next and a proxy. */
export function localRedirect(target: URL): Response {
  const path = `${target.pathname}${target.search}`
  if (!safeNext(path) || /[\r\n]/.test(path)) throw new Error('Redirect must stay within the site')
  return new Response(null, { status: 307, headers: { location: path, 'cache-control': 'no-store' } })
}
