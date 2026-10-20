import type { ReactNode } from 'react'

export const ownerPrimary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40'
export const ownerSecondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-sand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 disabled:opacity-40'
export const ownerInput = 'mt-1 w-full min-w-0 rounded-lg border border-sand-300 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-100 disabled:bg-sand-50'

export function OwnerField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm text-ink-soft">{label}{children}</label>
}
