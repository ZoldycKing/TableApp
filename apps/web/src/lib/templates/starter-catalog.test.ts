import { describe, expect, it } from 'vitest'
import { ANONYMOUS, asRole, canEnter, visibleScreensFor } from '../app-roles'
import { findStarter, findTemplate, STARTER_GROUPS, STARTER_TEMPLATES } from './catalog'
import { templateExample } from './presentation'

describe('task-based starters and compatibility', () => {
  it('offers sales once and keeps the former definitions available without advertising a separate cabinet', () => {
    const ids = STARTER_TEMPLATES.map(template => template.id)
    expect(ids).toHaveLength(11)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('katalog')
    expect(ids).not.toContain('portal')
    expect(findStarter('katalog')).toBe(findStarter('zakazy'))
    expect(findStarter('portal')).toBeUndefined()
    expect(findStarter('unknown')).toBeUndefined()
    expect(findTemplate('katalog')?.customer?.cart).toBeTruthy()
    expect(findTemplate('portal')?.customerSections).toHaveLength(1)
    expect(findTemplate('zakazy', true)?.name).toBe('Учёт заказов')
    expect(findTemplate('crm', true)?.customer).toBeUndefined()
  })

  it('installs a rich public catalogue and distinct private order positions with saved prices', () => {
    const example = templateExample('zakazy'), config = example.app.customer!
    const goods = example.table('goods'), positions = example.table('items')
    expect(config.catalog?.tableId).toBe(goods.id)
    expect(config.cart?.itemsTableId).toBe(positions.id)
    expect(config.catalog?.tableId).not.toBe(config.cart?.itemsTableId)
    const publicCard = example.app.screens.find(screen => screen.id === config.catalog!.detailScreenId)!
    expect(publicCard.access.publicFields).toContain(example.field('goods', 'photo').id)
    expect(publicCard.access.publicFields).toContain(example.field('goods', 'descr').id)
    expect(publicCard.access.publicFields).not.toContain(config.emailFieldId)
    expect(visibleScreensFor(example.app, ANONYMOUS)).toHaveLength(2)
    expect(visibleScreensFor(example.app, ANONYMOUS).some(screen => screen.id === config.formScreenId)).toBe(false)
  })

  it('makes the internal choices inaccessible to guests and ordinary clients while preserving staff modules', () => {
    for (const id of STARTER_GROUPS.find(group => group.id === 'internal-tools')!.templateIds) {
      const { app } = templateExample(id)
      expect(canEnter(app, ANONYMOUS), id).toBe(false)
      expect(canEnter(app, asRole('client', 'client@example.invalid')), id).toBe(false)
      if (id === 'proekty') {
        expect(visibleScreensFor(app, asRole('manager')).length, id).toBeGreaterThan(0)
        continue
      }
      expect(app.modules?.length, id).toBeGreaterThan(0)
      expect(visibleScreensFor(app, asRole(id === 'proizvodstvo' ? 'director' : 'manager')).length, id).toBeGreaterThan(0)
    }
    const crm = templateExample('crm').app
    expect(crm.screens.filter(screen => screen.access.roles.includes('manager') && screen.tab).map(screen => screen.tab!.label)).not.toContain('Обращения в отдел продаж')
    expect(crm.screens.some(screen => screen.name === 'Все сделки')).toBe(true)
  })
})
