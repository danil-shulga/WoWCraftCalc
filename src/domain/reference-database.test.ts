/// <reference types="node" />
import { readFileSync } from 'node:fs'

import { referenceFixture } from '../test/reference-fixture'

import { parseReferenceDatabase, referenceItemSchema } from './reference-database.schema'
import { GAME_VERSIONS, GAME_VERSION_REGISTRY } from './game-version'

describe('справочник', () => {
  it.each(['itemLevel', 'classId', 'subclassId', 'inventoryType'] as const)(
    'требует неотрицательное целое %s и сохраняет ноль',
    (field) => {
      const item = referenceFixture().items['1']
      expect(referenceItemSchema.parse({ ...item, [field]: 0 })[field]).toBe(0)
      for (const invalid of [-1, 1.5, null, undefined, '8']) {
        expect(() => referenceItemSchema.parse({ ...item, [field]: invalid })).toThrow()
      }
      const { [field]: omitted, ...withoutField } = item
      expect(omitted).toBeDefined()
      expect(() => referenceItemSchema.parse(withoutField)).toThrow()
    },
  )
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
    { schemaVersion: 1 },
    { build: 'other' },
    { iconSource: { provider: 'Wowhead', version: 'classic' } },
  ])('отклоняет неверную версию %j', (change) => {
    expect(() => parseReferenceDatabase({ ...referenceFixture(), ...change })).toThrow()
  })
  it.each(GAME_VERSIONS)('проверяет реальный JSON %s', (version) => {
    const value: unknown = JSON.parse(
      readFileSync(`public/${GAME_VERSION_REGISTRY[version].databasePath}`, 'utf8'),
    )
    const db = parseReferenceDatabase(value, version)
    expect(db.items['2302']).toMatchObject({ requiredLevel: 3, qualityId: 1 })
    expect(Object.keys(db.items)).toHaveLength(
      { forever: 2348, tbc: 2376, classic: 1445 }[version],
    )
    expect(
      Object.values(db.recipes).every((recipe) => recipe.output.quantity === null),
    ).toBe(true)
    expect(
      Object.values(db.professions).some(
        (profession) => profession.id === 'jewelcrafting',
      ),
    ).toBe(version === 'tbc')
  })
  it('отклоняет чужую базу, смешанное происхождение и неизвестную профессию', () => {
    expect(() => parseReferenceDatabase(referenceFixture('tbc'), 'classic')).toThrow()
    const fixture = referenceFixture()
    const source = fixture.sources[0]
    if (!source) throw new Error('Нет источника')
    source.product = 'wow_anniversary'
    expect(() => parseReferenceDatabase(fixture)).toThrow()
    expect(() =>
      parseReferenceDatabase({
        ...referenceFixture(),
        professions: { '197': { id: 'unknown', skillLineId: 197, nameRu: 'Unknown' } },
      }),
    ).toThrow()
  })
})
