import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProjectsShot } from '@/components/builder/v2/projects-shot'

export const metadata: Metadata = { title: 'Проекты и задачи', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ProjectsShotPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const query = await searchParams
  return <ProjectsShot view={query.view ?? 'board'} />
}
