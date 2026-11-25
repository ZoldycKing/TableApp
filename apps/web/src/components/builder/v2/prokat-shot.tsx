'use client'
import { ProkatDemo } from './prokat-demo'

export function ProkatShot({ view, scheme, phone }: { view: string; scheme?: 'light' | 'dark'; phone?: boolean }) {
  return <ProkatDemo view={view} bare scheme={scheme} phone={phone} />
}
