'use client'
import { InvoicesDemo } from './invoices-demo'

export function InvoicesShot({ view, scheme, phone }: { view: string; scheme?: 'light' | 'dark'; phone?: boolean }) {
  return <InvoicesDemo view={view} bare scheme={scheme} phone={phone} />
}