/// <reference types="node" />
import { readFileSync } from 'node:fs'

import { referenceFixture } from '../test/reference-fixture'

import { parseReferenceDatabase } from './reference-database.schema'

describe('справочник', () => {
  it('сохраняет неизвестный выход и допускает внешний инструмент', () => {
    const db = parseReferenceDatabase(referenceFixture())
    expect(db.recipes['10']?.output.quantity).toBeNull()
    expect(db.recipes['10']?.tools.itemIds).toEqual([999])
  })
  it('допускает несколько рецептов одного результата', () => {
    const fixture = referenceFixture()
    const recipe = fixture.recipes['10']
    expect(
      parseReferenceDatabase({
        ...fixture,
        items: {
          ...fixture.items,
          '1': { ...fixture.items['1'], recipeSpellIds: [10, 11] },
        },
        recipes: { ...fixture.recipes, '11': { ...recipe, spellId: 11 } },
      }).items['1']?.recipeSpellIds,
    ).toEqual([10, 11])
  })
  it.each([0, -1, 1.5])('отклоняет количество %s', (quantity) => {
    const fixture = referenceFixture()
    fixture.recipes['10'].reagents[0] = { itemId: 2, quantity }
    expect(() => parseReferenceDatabase(fixture)).toThrow()
  })
  it('отклоняет отсутствующий реагент, дубли и повреждённые ссылки', () => {
    const fixture = referenceFixture()
    fixture.recipes['10'].reagents = [{ itemId: 999, quantity: 1 }]
    expect(() => parseReferenceDatabase(fixture)).toThrow()
    fixture.recipes['10'].reagents = [
      { itemId: 2, quantity: 1 },
      { itemId: 2, quantity: 2 },
    ]
    expect(() => parseReferenceDatabase(fixture)).toThrow()
    fixture.recipes['10'].reagents = [{ itemId: 2, quantity: 1 }]
    fixture.items['1'].recipeSpellIds = []
    expect(() => parseReferenceDatabase(fixture)).toThrow()
  })
  it.each([
    { schemaVersion: 2 },
    { build: 'other' },
    { iconSource: { provider: 'Wowhead', version: 'classic' } },
  ])('отклоняет неверную версию %j', (change) => {
    expect(() => parseReferenceDatabase({ ...referenceFixture(), ...change })).toThrow()
  })
  it('проверяет весь подготовленный JSON', () => {
    const value: unknown = JSON.parse(
      readFileSync('public/data/craftcalc-db.1.60.1.70338.json', 'utf8'),
    )
    const db = parseReferenceDatabase(value)
    expect(Object.keys(db.items)).toHaveLength(2344)
    expect(Object.keys(db.recipes)).toHaveLength(1984)
  })
})
