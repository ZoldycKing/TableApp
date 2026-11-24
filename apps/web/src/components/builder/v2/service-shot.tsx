'use client'
import { ServiceDemo } from './service-demo'

export function ServiceShot({ view, scheme, phone }: { view: string; scheme?: 'light' | 'dark'; phone?: boolean }) {
  return <ServiceDemo view={view} bare scheme={scheme} phone={phone} />
}
