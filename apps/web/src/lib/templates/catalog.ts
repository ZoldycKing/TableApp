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
import { asSalesStarter } from './sales'
import { STARTER_GROUPS } from './starter-groups'
export { STARTER_GROUPS } from './starter-groups'

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
/** Supported definitions include older starters for existing links and tools. */
export const TEMPLATES: readonly TemplateDef[] = LEGACY_TEMPLATES.map(template => {
  const ready = withCustomerScenario(template)
  if (template.id === 'crm') return { ...ready, internalOnly: true,
    gives: template.gives, limits: template.limits, kin: template.kin }
  return template.id === 'zakazy' ? asSalesStarter(ready) : ready
})

/** The public choice is smaller than the compatibility registry. */
export const STARTER_TEMPLATES: readonly TemplateDef[] = STARTER_GROUPS.flatMap(group =>
  group.templateIds.map(id => TEMPLATES.find(template => template.id === id)!))

export function findStarter(id: string | undefined): TemplateDef | undefined {
  return STARTER_TEMPLATES.find(template => template.id === (id === 'katalog' ? 'zakazy' : id))
}

export function findTemplate(id: string, legacy = false): TemplateDef | undefined {
  return (legacy ? LEGACY_TEMPLATES : TEMPLATES).find((template) => template.id === id)
}
