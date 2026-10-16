/// <reference types="node" />
import { readFileSync } from 'node:fs'

import { GAME_VERSION_REGISTRY } from './game-version'
import {
  buildReferenceDatabaseIndex,
  searchReferenceItems,
} from './reference-database-index'
import { parseReferenceDatabase } from './reference-database.schema'

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
