import type { ReactNode } from 'react'

export const ownerPrimary = 'platform-primary'
export const ownerSecondary = 'platform-secondary'
export const ownerInput = 'platform-input'

export function OwnerField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm text-ink-soft">{label}{children}</label>
}
