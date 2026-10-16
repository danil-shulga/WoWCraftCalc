import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { databaseSchema, statistics } from './contract.mjs'

function fixture() {
  const legacy = JSON.parse(
    readFileSync('public/data/craftcalc-db.1.60.1.70338.json', 'utf8'),
  )
  const recipe = structuredClone(legacy.recipes['2149'])
  recipe.output.rawEffectParameters = {
    Effect: '24',
    EffectItemType: '2302',
    EffectBasePointsF: '1',
  }
  recipe.tools = { itemIds: [999999], categoryIds: [14, 14] }
  const items = Object.fromEntries(
    [2302, 2318, 2320].map((id) => {
      const item = structuredClone(legacy.items[id])
      item.requiredLevel = 8
      item.itemLevel = 12
      item.classId = 4
      item.subclassId = 0
      item.inventoryType = 8
      item.recipeSpellIds = id === 2302 ? [2149] : []
      return [id, item]
    }),
  )
  const sourceTables = [
    ['Item', 'enUS'],
    ['ItemSparse', 'enUS'],
    ['ItemSparse', 'ruRU'],
    ['SpellReagents', 'enUS'],
    ['SpellEffect', 'enUS'],
    ['SkillLineAbility', 'enUS'],
    ['SkillLine', 'ruRU'],
    ['SpellTotems', 'enUS'],
  ]
  const db = {
    format: legacy.format,
    schemaVersion: 2,
    gameVersion: 'forever',
    mode: 'beta',
    build: legacy.build,
    product: 'wow_classic_beta',
    snapshotDate: '2026-10-12',
    locales: ['ruRU', 'enUS'],
    sources: legacy.sources.map((s, i) => ({
      ...s,
      fileName: `${sourceTables[i][0]}.${sourceTables[i][1]}.${legacy.build}.csv`,
      table: sourceTables[i][0],
      locale: sourceTables[i][1],
      path: `data-preparation/raw/${s.fileName}`,
      product: 'wow_classic_beta',
      build: legacy.build,
      url: `https://wago.tools/db2/${sourceTables[i][0]}/csv?build=${legacy.build}&locale=${sourceTables[i][1]}`,
    })),
    selection: {
      status: 'client-table-candidates',
      effect: 24,
      rules: ['fixture'],
      availability: 'Unverified',
    },
    itemScope: legacy.itemScope,
    iconSource: legacy.iconSource,
    notes: ['fixture'],
    professions: { 165: legacy.professions['165'] },
    items,
    recipes: { 2149: recipe },
    excludedRecipeEffects: [],
  }
  db.statistics = statistics(db)
  return db
}

test('preserves all twelve item fields, unknown output and external tool slots', () => {
  const db = databaseSchema.parse(fixture())
  assert.equal(Object.keys(db.items['2302']).length, 12)
  assert.equal(db.items['2302'].requiredLevel, 8)
  assert.equal(db.items['2302'].itemLevel, 12)
  assert.equal(db.items['2302'].classId, 4)
  assert.equal(db.items['2302'].subclassId, 0)
  assert.equal(db.items['2302'].inventoryType, 8)
  assert.equal(db.recipes['2149'].output.quantity, null)
  assert.deepEqual(db.recipes['2149'].tools, { itemIds: [999999], categoryIds: [14, 14] })
})

test('requires nonnegative integer metadata, preserving zero', () => {
  for (const field of ['itemLevel', 'classId', 'subclassId', 'inventoryType']) {
    const db = fixture()
    db.items['2302'][field] = 0
    assert.equal(databaseSchema.parse(db).items['2302'][field], 0)
    for (const invalid of [-1, 1.5, null, undefined, '8']) {
      db.items['2302'][field] = invalid
      assert.throws(() => databaseSchema.parse(db), `${field}: ${invalid}`)
    }
    delete db.items['2302'][field]
    assert.throws(() => databaseSchema.parse(db), `${field}: missing`)
  }
})

test('accepts observed Wowhead icon names containing a hyphen', () => {
  const db = fixture()
  db.items['2302'].iconUrl =
    'https://wow.zamimg.com/images/wow/icons/large/inv_chest-_cloth_skybornec60_b_01.jpg'
  assert.equal(databaseSchema.parse(db).items['2302'].iconUrl, db.items['2302'].iconUrl)
})

test('rejects extra catalog items, broken reverse links and incomplete recipes', () => {
  for (const mutate of [
    (db) => {
      db.items['999'] = { ...db.items['2318'], itemId: 999 }
    },
    (db) => {
      db.items['2302'].recipeSpellIds = []
    },
    (db) => {
      delete db.items['2318']
    },
    (db) => {
      db.recipes['2149'].reagents.push({ itemId: 2318, quantity: 1 })
    },
    (db) => {
      db.recipes['2149'].reagents[0].quantity = 0
    },
  ]) {
    const db = fixture()
    mutate(db)
    assert.throws(() => databaseSchema.parse(db))
  }
})

test('rejects mixed builds, locales, game mode, icon cache identity and stale statistics', () => {
  for (const mutate of [
    (db) => {
      db.items['2302'].requiredLevel = -1
    },
    (db) => {
      db.items['2302'].requiredLevel = 1.5
    },
    (db) => {
      delete db.items['2302'].requiredLevel
    },
    (db) => {
      db.items['2302'].qualityId = -1
    },
    (db) => {
      db.sources[0].build = '2.5.6.69795'
    },
    (db) => {
      db.sources[0].locale = 'ruRU'
    },
    (db) => {
      db.mode = 'era'
    },
    (db) => {
      db.iconSource.version = 'tbc'
    },
    (db) => {
      db.statistics.recipes = 2
    },
    (db) => {
      db.items['2318'].vendor.sellPriceCopper = -1
    },
    (db) => {
      db.items['2318'].unexpected = true
    },
  ]) {
    const db = fixture()
    mutate(db)
    assert.throws(() => databaseSchema.parse(db))
  }
})

test('allows cycles between alternative recipes without selecting a crafting graph', () => {
  const db = fixture()
  db.recipes['2150'] = {
    ...structuredClone(db.recipes['2149']),
    spellId: 2150,
    productItemId: 2318,
    reagents: [{ itemId: 2302, quantity: 1 }],
  }
  db.items['2318'].recipeSpellIds = [2150]
  db.recipes['2150'].output.rawEffectParameters.EffectItemType = '2318'
  db.statistics = statistics(db)
  assert.equal(Object.keys(databaseSchema.parse(db).recipes).length, 2)
})

test('validates additional reagent provenance and rejects disconnected conversions', () => {
  const db = fixture()
  db.itemScope = 'recipe-products-and-profession-reagents'
  db.items['999'] = { ...structuredClone(db.items['2318']), itemId: 999 }
  db.reagentSources = [
    {
      spellId: 100,
      kind: 'item-conversion',
      productItemId: 2318,
      profession: null,
      reagents: [{ itemId: 999, quantity: 2 }],
      source: { effectRowId: 200, reagentsRowId: 300, abilityRowIds: [] },
    },
  ]
  db.statistics = statistics(db)
  assert.equal(databaseSchema.parse(db).statistics.reagentItems, 3)
  for (const mutate of [
    (value) => {
      value.reagentSources[0].productItemId = 999
    },
    (value) => {
      value.reagentSources[0].reagents[0].itemId = 888
    },
    (value) => {
      value.reagentSources[0].source.abilityRowIds = [1]
    },
    (value) => {
      value.reagentSources.push(structuredClone(value.reagentSources[0]))
    },
    (value) => {
      value.reagentSources[0].kind = 'enchantment'
    },
    (value) => {
      value.itemScope = 'recipe-products-and-consumed-reagents'
    },
  ]) {
    const changed = structuredClone(db)
    mutate(changed)
    changed.statistics = statistics(changed)
    assert.throws(() => databaseSchema.parse(changed))
  }
})
