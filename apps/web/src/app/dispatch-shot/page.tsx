import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DispatchShot } from '@/components/builder/v2/dispatch-shot'

export const metadata: Metadata = { title: 'Заявки', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function DispatchShotPage({ searchParams }: { searchParams: Promise<{ view?: string; phone?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const query = await searchParams
  return <DispatchShot view={query.view ?? 'overview'} phone={query.phone === '1'} />
}
