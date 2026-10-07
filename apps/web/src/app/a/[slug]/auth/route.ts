import { localRedirect } from '@/lib/local-redirect'
import { consumeAppToken } from '@/app/auth-actions'

/** Переход по ссылке из письма: токен обменивается на сессию. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const token = new URL(request.url).searchParams.get('token')
  const target = new URL(`/a/${slug}`, request.url)

  if (!token) {
    target.searchParams.set('error', 'Ссылка неполная')
    return localRedirect(target)
  }

  const result = await consumeAppToken(slug, token)
  if (!result.ok) target.searchParams.set('error', result.error ?? 'Не удалось войти')

  return localRedirect(target)
}
