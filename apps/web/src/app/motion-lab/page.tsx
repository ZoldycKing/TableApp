import { MarketingShell } from '@/components/marketing/blocks'
import { MotionLab } from '@/components/marketing/motion-lab/motion-lab'
import { pageMetadata } from '@/lib/seo'

export const metadata = {
  ...pageMetadata({
    path: '/motion-lab', title: 'Примеры анимаций',
    description: 'Пять анимированных сценариев TableApp: представления, общие данные, заявки, роли и приёмка с телефона.',
  }),
  robots: { index: false, follow: false },
}

export default function MotionLabPage() {
  return (
    <MarketingShell signedIn={false}>
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-6 sm:px-8 sm:pt-8">
        <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">Как оживают данные</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft sm:text-base">
          Пять сюжетов для TableApp с автоматической сменой сцен.
        </p>
        <MotionLab />
      </div>
    </MarketingShell>
  )
}
