import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { InvoicesShot } from '@/components/builder/v2/invoices-shot'

export const metadata: Metadata = { title: 'Счета и сметы', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function InvoicesShotPage({ searchParams }: { searchParams: Promise<{ view?: string; scheme?: string; phone?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const query = await searchParams
  const scheme = query.scheme === 'dark' ? 'dark' : query.scheme === 'light' ? 'light' : undefined
  return <InvoicesShot view={query.view ?? 'home'} scheme={scheme} phone={query.phone === '1' || query.phone === 'true'} />
}