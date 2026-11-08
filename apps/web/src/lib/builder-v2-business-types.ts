import type { AppV2BusinessOperation } from '@tableapp/schema/app-v2'
import { INVENTORY_COPY } from './inventory'

export const BUILDER_BUSINESS_COPY = {
  inventory_items: { label: 'Товары и остатки', icon: 'box' },
  inventory_receipt: { label: INVENTORY_COPY.receipt.action, icon: 'box' },
  inventory_issue: { label: INVENTORY_COPY.issue.action, icon: 'box' },
  inventory_writeOff: { label: INVENTORY_COPY.writeOff.action, icon: 'box' },
  inventory_returnIn: { label: INVENTORY_COPY.returnIn.action, icon: 'box' },
  inventory_returnOut: { label: INVENTORY_COPY.returnOut.action, icon: 'box' },
  inventory_stocktake: { label: INVENTORY_COPY.stocktake.name, icon: 'box' },
  production_run: { label: 'Записать выпуск', icon: 'wrench' },
  production_movement: { label: 'Записать движение материала', icon: 'wrench' },
  booking_create: { label: 'Записаться', icon: 'calendar' },
} as const satisfies Record<AppV2BusinessOperation, { label: string; icon: string }>

export type BuilderBusinessApp = {
  id: string; name: string
  operations: { operation: AppV2BusinessOperation; recordTableId: string | null }[]
}
export type BuilderBusinessLink = { name: string; operation: AppV2BusinessOperation; href: string }
