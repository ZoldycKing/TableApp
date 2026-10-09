import type { TemplateDef } from './types'
import { crm } from './defs/crm'
import { dostavka } from './defs/dostavka'
import { katalog } from './defs/katalog'
import { nedvizhimost } from './defs/nedvizhimost'
import { portal } from './defs/portal'
import { proizvodstvo } from './defs/proizvodstvo'
import { salon } from './defs/salon'
import { service } from './defs/service'
import { sklad } from './defs/sklad'
import { zakazy } from './defs/zakazy'
import { zayavki } from './defs/zayavki'
import { withCustomerScenario } from './customer-definitions'

/**
 * Готовые шаблоны.
 *
 * Каждый описан декларацией в defs/ — без кода, поэтому новый шаблон стоит
 * дня работы, а не недели. Порядок в списке — это и порядок на витрине:
 * сначала то, за чем приходят чаще всего.
 *
 * Правило одно: шаблон честен, только если продукт тянет его суть. Обещать
 * маршруты в «Доставке» или расписание с напоминаниями в «Салоне» нельзя,
 * пока этого нет, — поэтому в описаниях сказано ровно то, что заработает
 * сразу после установки.
 */
const LEGACY_TEMPLATES: readonly TemplateDef[] = [
  zayavki,
  zakazy,
  crm,
  portal,
  proizvodstvo,
  sklad,
  service,
  salon,
  nedvizhimost,
  dostavka,
  katalog,
]
export const TEMPLATES: readonly TemplateDef[] = LEGACY_TEMPLATES.map(withCustomerScenario)

export function findTemplate(id: string, legacy = false): TemplateDef | undefined {
  return (legacy ? LEGACY_TEMPLATES : TEMPLATES).find((template) => template.id === id)
}
