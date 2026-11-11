'use client'
import { createContext, useContext } from 'react'

export const PurchaseDialogTotalContext = createContext<((total: number | null) => void) | null>(null)
export function usePurchaseDialogTotal() {
  return useContext(PurchaseDialogTotalContext)
}
