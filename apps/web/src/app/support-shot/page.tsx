import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SupportShot } from '@/components/builder/v2/support-shot'

export const metadata: Metadata = { title: 'Обращения и поддержка', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function SupportShotPage({ searchParams }: { searchParams: Promise<{ view?: string; scheme?: string; phone?: string; team?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const query = await searchParams
  const scheme = query.scheme === 'dark' ? 'dark' : query.scheme === 'light' ? 'light' : undefined
  const team = query.team === 'large' || query.team === 'big' ? 'large' : 'small'
  return <SupportShot view={query.view ?? 'queue'} scheme={scheme} phone={query.phone === '1' || query.phone === 'true'} team={team} />
}
