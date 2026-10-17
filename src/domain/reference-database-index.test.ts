/// <reference types="node" />
import { readFileSync } from 'node:fs'

import { GAME_VERSION_REGISTRY } from './game-version'
import {
  buildReferenceDatabaseIndex,
  searchReferenceItems,
} from './reference-database-index'
import { parseReferenceDatabase } from './reference-database.schema'
import { referenceFixture } from '../test/reference-fixture'

function tiedNamesDatabase() {
  const db = parseReferenceDatabase(referenceFixture())
  const product = db.items['1']
  const reagent = db.items['2']
  const recipe = db.recipes['10']
  if (!product || !reagent || !recipe) throw new Error('Нет данных фикстуры')
  const names = { ru: 'Одинаковый', en: 'Equal' }
  db.items['1'] = { ...product, names }
  db.items['3'] = { ...product, itemId: 3, names, recipeSpellIds: [5, 6] }
  db.items['4'] = { ...reagent, itemId: 4 }
  db.recipes['5'] = {
    ...recipe,
    spellId: 5,
    productItemId: 3,
    reagents: [
      { itemId: 4, quantity: 1 },
      { itemId: 2, quantity: 1 },
    ],
  }
  db.recipes['6'] = { ...db.recipes['5'], spellId: 6 }
  db.recipes['10'] = {
    ...recipe,
    reagents: [
      { itemId: 2, quantity: 1 },
      { itemId: 4, quantity: 1 },
    ],
  }
  return parseReferenceDatabase(db)
}

describe('подготовленный порядок поиска', () => {
  it.each(['ru', 'en'] as const)(
    'сохраняет порядок равных имён каждого раздела: %s',
    (language) => {
      const index = buildReferenceDatabaseIndex(tiedNamesDatabase())
      for (const profession of [null, 'tailoring'] as const) {
        expect(
          searchReferenceItems(index, 'crafts', '', profession, language).map(
            ({ itemId }) => itemId,
          ),
        ).toEqual([3, 1])
        expect(
          searchReferenceItems(index, 'reagents', '', profession, language).map(
            ({ itemId }) => itemId,
          ),
        ).toEqual([4, 2])
        expect(
          searchReferenceItems(index, 'disenchanting', '', profession, language).map(
            ({ itemId }) => itemId,
          ),
        ).toEqual([1, 3])
      }
      expect(index.recipesByProduct.get(3)).toHaveLength(2)
      expect(searchReferenceItems(index, 'crafts', '', 'alchemy', language)).toEqual([])
    },
  )

  it('меняет порядок по языку, сохраняя подстановку отсутствующего перевода', () => {
    const db = tiedNamesDatabase()
    const first = db.items['1']
    const third = db.items['3']
    if (!first || !third) throw new Error('Нет предмета')
    db.items['1'] = { ...first, names: { ru: 'Яркий', en: 'Amber' } }
    db.items['3'] = { ...third, names: { ru: 'Алый', en: null } }
    const index = buildReferenceDatabaseIndex(db)
    expect(
      searchReferenceItems(index, 'crafts', '', null, 'ru').map(({ itemId }) => itemId),
    ).toEqual([3, 1])
    expect(
      searchReferenceItems(index, 'crafts', '', null, 'en').map(({ itemId }) => itemId),
    ).toEqual([1, 3])
    expect(
      searchReferenceItems(index, 'crafts', '  АЛЫЙ  ', null, 'en').map(
        ({ itemId }) => itemId,
      ),
    ).toEqual([3])
  })

  it('не сортирует результаты заново при запросе или смене языка поиска', () => {
    const index = buildReferenceDatabaseIndex(tiedNamesDatabase())
    const compare = vi.spyOn(String.prototype, 'localeCompare')
    try {
      for (const language of ['ru', 'en'] as const) {
        for (const section of ['crafts', 'reagents', 'disenchanting'] as const)
          searchReferenceItems(index, section, '  EQUAL  ', null, language)
      }
      expect(compare).not.toHaveBeenCalled()
    } finally {
      compare.mockRestore()
    }
  })
})

describe('реагенты без рецепта создания предмета', () => {
  const value: unknown = JSON.parse(
    readFileSync(`public/${GAME_VERSION_REGISTRY.tbc.databasePath}`, 'utf8'),
  )
  const database = parseReferenceDatabase(value, 'tbc')
  const index = buildReferenceDatabaseIndex(database)

  it('находит экипировку для распыления среди продуктов, не включая материалы', () => {
    expect(
      searchReferenceItems(index, 'disenchanting', 'Netherweave Boots').map(
        ({ itemId }) => itemId,
      ),
    ).toContain(21853)
    expect(
      searchReferenceItems(index, 'disenchanting', 'Netherweave Boots', 'tailoring').map(
        ({ itemId }) => itemId,
      ),
    ).toContain(21853)
    expect(
      searchReferenceItems(index, 'disenchanting', 'Netherweave Boots', 'alchemy'),
    ).toEqual([])
    expect(searchReferenceItems(index, 'disenchanting', 'Arcane Dust')).toEqual([])
  })

  it.each([
    [22572, 'Mote of Air'],
    [22575, 'Mote of Life'],
    [22576, 'Mote of Mana'],
    [22577, 'Mote of Shadow'],
    [11174, 'Lesser Nether Essence'],
    [11175, 'Greater Nether Essence'],
    [10998, 'Lesser Astral Essence'],
    [22447, 'Lesser Planar Essence'],
    [10978, 'Small Glimmering Shard'],
    [11084, 'Large Glimmering Shard'],
    [11138, 'Small Glowing Shard'],
    [11139, 'Large Glowing Shard'],
    [11177, 'Small Radiant Shard'],
  ])('находит %s — %s в реагентах, а не в крафтах', (itemId, name) => {
    expect(
      searchReferenceItems(index, 'reagents', name).map((item) => item.itemId),
    ).toContain(itemId)
    expect(
      searchReferenceItems(index, 'crafts', name).map((item) => item.itemId),
    ).not.toContain(itemId)
  })

  it('учитывает профессию зачарования и профессию потребителя результата превращения', () => {
    expect(
      searchReferenceItems(index, 'reagents', 'Lesser Nether Essence', 'enchanting').map(
        (item) => item.itemId,
      ),
    ).toContain(11174)
    expect(
      searchReferenceItems(index, 'reagents', 'Mote of Life', 'alchemy').map(
        (item) => item.itemId,
      ),
    ).toContain(22575)
    expect(
      searchReferenceItems(index, 'reagents', 'Lesser Nether Essence', 'cooking'),
    ).toEqual([])
  })

  it('отклоняет потерянную ссылку источника реагентов', () => {
    const changed = {
      ...database,
      reagentSources: [
        {
          spellId: 1,
          kind: 'item-conversion',
          productItemId: 21886,
          profession: null,
          reagents: [{ itemId: 999999, quantity: 1 }],
          source: { effectRowId: 1, reagentsRowId: 1, abilityRowIds: [] },
        },
      ],
    }
    expect(() => parseReferenceDatabase(changed)).toThrow()
  })
})
