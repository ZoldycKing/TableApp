'use client'
import { InvoicesDemo } from './invoices-demo'

export function InvoicesShot({ view, scheme }: { view: string; scheme?: 'light' | 'dark' }) {
  return <InvoicesDemo view={view} bare scheme={scheme} />
}