import { describe, expect, it } from 'vitest'
import { buildFromCsv } from '@tableapp/import'
import { EXAMPLE_CSV, exampleImportColumns } from './import-example'
import { guessMapping } from './import-plan'
import { templateExample } from './templates/presentation'

describe('the onboarding import uses actual inference and warehouse opening balances', () => {
  it('does not promise automatic status choices or a currency format', () => {
    const imported = buildFromCsv(EXAMPLE_CSV)
    expect(imported.fields.find(field => field.name === 'Статус')?.type).toBe('text')
    const sum = imported.fields.find(field => field.name === 'Сумма')!
    expect(sum.type).toBe('number')
    if (sum.type === 'number') expect(sum.options.format).toBe('plain')
    expect(exampleImportColumns().find(column => column[0] === 'Сумма')?.[2]).toBe('Число')
  })
  it('maps stock to opening balance and gives an explicitly named opening column priority', () => {
    const example = templateExample('sklad')
    const fields = example.byTable.get(example.table('items').id)!
    const opening = example.field('items', 'opening').id
    expect(guessMapping(buildFromCsv('Остаток;Название\n12;Товар'), fields)[0]).toBe(opening)
    const mapping = guessMapping(buildFromCsv('Остаток;Начальный остаток\n12;9'), fields)
    expect(mapping[0]).toBeUndefined()
    expect(mapping[1]).toBe(opening)
    expect(Object.values(mapping)).not.toContain(example.field('items', 'qty').id)
  })
})
