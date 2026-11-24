'use client'
import { SupportDemo } from './support-demo'

export function SupportShot({ view, scheme, phone, team = 'small' }: { view: string; scheme?: 'light' | 'dark'; phone?: boolean; team?: 'small' | 'large' }) {
  return <SupportDemo view={view} bare scheme={scheme} phone={phone} team={team} />
}
