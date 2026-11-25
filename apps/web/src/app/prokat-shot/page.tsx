import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProkatShot } from '@/components/builder/v2/prokat-shot'

export const metadata: Metadata = { title: 'Прокат', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ProkatShotPage({ searchParams }: { searchParams: Promise<{ view?: string; scheme?: string; phone?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const query = await searchParams
  const scheme = query.scheme === 'dark' ? 'dark' : query.scheme === 'light' ? 'light' : undefined
  return <ProkatShot view={query.view ?? 'bookings'} scheme={scheme} phone={query.phone === '1' || query.phone === 'true'} />
}
