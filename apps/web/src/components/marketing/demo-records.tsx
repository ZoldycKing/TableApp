'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { PRODUCTS, type Product } from './catalog-data'

const DemoRecordsContext = createContext<{
  products: Product[]
  update: (products: Product[]) => void
} | null>(null)

/** One local source for the homepage's table, receipt and resulting screens. */
export function DemoRecordsProvider({ children }: { children: ReactNode }) {
  const [products, update] = useState(PRODUCTS)
  const value = useMemo(() => ({ products, update }), [products])
  return <DemoRecordsContext value={value}>{children}</DemoRecordsContext>
}

export function useDemoRecords() { return useContext(DemoRecordsContext) }
