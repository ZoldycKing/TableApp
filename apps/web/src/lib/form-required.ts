import type { App, Screen } from '@tableapp/schema'
import { canOpenScreen, canSeePart, type Visitor } from './app-roles'

export function hasRequiredValues(screen: Screen, visitor: Visitor, values: Record<string, unknown>): boolean {
  if (screen.type !== 'form') return false
  return screen.components.every(component => {
    if (component.type !== 'form_field' || !component.required || !canSeePart(component, visitor)) return true
    const value = values[component.fieldId]
    return value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '') &&
      !(Array.isArray(value) && value.length === 0)
  })
}

export function canCreateWithValues(app: App, tableId: string, visitor: Visitor, values: Record<string, unknown>): boolean {
  return app.screens.some(screen => screen.type === 'form' && screen.mode === 'create' && screen.tableId === tableId &&
    canOpenScreen(screen, visitor) && hasRequiredValues(screen, visitor, values))
}
