import { cookies } from 'next/headers'
import { localRedirect } from '@/lib/local-redirect'
import { consumeMemberToken } from '@/app/auth-actions'
import { switchWorkspaceAction } from '@/app/team-actions'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/auth'

/** Переход по ссылке из письма: токен обменивается на сессию участника. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const invitedWorkspace = url.searchParams.get('w')
  const target = new URL('/app', request.url)

  if (!token) {
    target.pathname = '/login'
    target.searchParams.set('error', 'Ссылка неполная')
    return localRedirect(target)
  }

  const result = await consumeMemberToken(token)
  if (!result.ok) {
    target.pathname = '/login'
    target.searchParams.set('error', result.error)
    return localRedirect(target)
  }

  // Ссылка ведёт туда же, куда и код: сотрудника — к его приложениям,
  // а подтверждённую, но никуда не добавленную почту — обратно с объяснением.
  if (result.go === 'apps') {
    target.pathname = '/my'
    return localRedirect(target)
  }

  if (result.go === 'nowhere') {
    target.pathname = '/login'
    target.searchParams.set('notice', 'nowhere')
    return localRedirect(target)
  }

  // Пришедший по приглашению должен попасть именно в тот воркспейс, куда звали,
  // а не в свой собственный, если он у него уже был.
  if (invitedWorkspace) {
    const switched = await switchWorkspaceAction(invitedWorkspace)
    if (!switched.ok) {
      const store = await cookies()
      store.delete(ACTIVE_WORKSPACE_COOKIE)
    }
  }

  return localRedirect(target)
}
