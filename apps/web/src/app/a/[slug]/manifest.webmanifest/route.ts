import { NextResponse } from 'next/server'
import { loadAppMeta } from '@/lib/app-runtime'

const ACCENT_HEX: Record<string, string> = {
  blue: '#2563eb', green: '#16a34a', violet: '#7c3aed', rose: '#e11d48',
  amber: '#f59e0b', teal: '#0d9488', indigo: '#4f46e5', gray: '#475569',
}

/** Манифест PWA: без него приложение не ставится на домашний экран. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const meta = await loadAppMeta(slug)
  if (!meta) return new NextResponse('Not found', { status: 404 })

  return NextResponse.json({
    name: meta.name,
    short_name: meta.name.slice(0, 12),
    start_url: `/a/${slug}`,
    scope: `/a/${slug}`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: ACCENT_HEX[meta.accent] ?? ACCENT_HEX.blue,
    lang: 'ru',
  })
}
