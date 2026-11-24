import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ServiceShot } from '@/components/builder/v2/service-shot'

export const metadata: Metadata = { title: 'Сервисный центр', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ServiceShotPage({ searchParams }: { searchParams: Promise<{ view?: string; scheme?: string; phone?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const query = await searchParams
  const scheme = query.scheme === 'dark' ? 'dark' : query.scheme === 'light' ? 'light' : undefined
  return <ServiceShot view={query.view ?? 'repairs'} scheme={scheme} phone={query.phone === '1' || query.phone === 'true'} />
}
