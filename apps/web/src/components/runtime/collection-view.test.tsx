// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { templateExample } from '@/lib/templates/presentation'
import { CollectionView } from './collection-view'

afterEach(cleanup)

it.each(['list', 'tiles'] as const)('shows and searches permitted relation labels in a %s without exposing raw IDs', type => {
  const example = templateExample('salon'), config = example.app.booking!
  const home = example.app.screens.find(screen => screen.id === example.app.homeScreenId)!
  if (home.type !== 'list') throw new Error('Expected the client booking list')
  const service = example.rows.find(row => row.tableId === config.tables.services)!
  const visit = example.rows.find(row => row.tableId === config.tables.visits)!
  const props = {
    screen: { ...home, type, columns: 2, source: { ...home.source, searchFieldIds: [config.visit.service] } },
    fields: example.fields.filter(field => field.tableId === config.tables.visits),
    rows: [
      { ...visit, data: { ...visit.data, [config.visit.service]: [service.id] } },
      { ...visit, id: 'other-visit', data: { ...visit.data, [config.visit.service]: ['private-service-id'] } },
    ],
    relatedTitles: { [config.tables.services]: [{ id: service.id, title: 'Женская стрижка' }] },
    state: { query: '', choiceId: null }, onState: () => {}, onOpenRow: () => {}, exportHref: null,
  }
  const ui = render(<CollectionView {...props} />)
  expect(ui.getByRole('button', { name: /Женская стрижка/ })).toBeTruthy()
  expect(ui.getByRole('button', { name: /Запись недоступна/ })).toBeTruthy()
  expect(ui.container.textContent).not.toContain(service.id)
  expect(ui.container.textContent).not.toContain('private-service-id')
  ui.rerender(<CollectionView {...props} state={{ query: 'женская', choiceId: null }} />)
  expect(ui.getByRole('button', { name: /Женская стрижка/ })).toBeTruthy()
  expect(ui.queryByRole('button', { name: /Запись недоступна/ })).toBeNull()
})
