'use client'
import { SupportDemo } from './support-demo'

export function SupportShot({ view, scheme, phone }: { view: string; scheme?: 'light' | 'dark'; phone?: boolean }) {
  return <SupportDemo view={view} bare scheme={scheme} phone={phone} />
}
