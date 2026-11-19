import { NextResponse } from 'next/server'
import { loadAppMeta } from '@/lib/app-runtime'

const ACCENT_HEX: Record<string, string> = {
  blue: '#4E7CA8', green: '#3F6B5C', violet: '#9A6B9E', rose: '#C94A4A',
  amber: '#C18A2B', teal: '#326e67', indigo: '#4b5296', gray: '#7A8591',
}

/** Манифест PWA: без него приложение не ставится на домашний экран. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const meta = await loadAppMeta(slug)
  if (!meta) return new NextResponse('Not found', { status: 404 })

  return NextResponse.json({
    name: meta.business ? `${meta.business.name} · ${meta.name}` : meta.name,
    short_name: (meta.business?.name ?? meta.name).slice(0, 24),
    start_url: `/a/${slug}`,
    scope: `/a/${slug}`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: ACCENT_HEX[meta.accent] ?? ACCENT_HEX.green,
    lang: 'ru',
  })
}
