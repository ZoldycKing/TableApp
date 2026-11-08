import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PrototypeEditor } from '@/components/builder/prototype/editor'
import { seedPrototype } from '@/components/builder/prototype/model'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Прототип конструктора', robots: { index: false, follow: false } }

export default function BuilderLabPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <PrototypeEditor initial={seedPrototype()} />
}
