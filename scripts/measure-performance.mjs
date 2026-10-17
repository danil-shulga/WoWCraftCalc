import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { platform, arch, cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { createServer } from 'vite'

const { values } = parseArgs({
  options: {
    output: { type: 'string' },
    compare: { type: 'string' },
    full: { type: 'boolean', default: false },
  },
})
const hash = (value) => createHash('sha256').update(value).digest('hex')
const iterations = 20
const warmups = 3
const results = []

function measure(name, run) {
  for (let i = 0; i < warmups; i++) run()
  const times = []
  let result
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    result = run()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  const measurement = {
    name,
    medianMs: times[Math.floor(iterations / 2)],
    p95Ms: times[Math.ceil(iterations * 0.95) - 1],
    minMs: times[0],
    maxMs: times.at(-1),
    resultHash: hash(JSON.stringify(result)),
  }
  results.push(measurement)
  console.log(`${name}: median=${measurement.medianMs.toFixed(3)} ms`)
  return result
}

// Middleware mode loads the project's TS modules without opening an HTTP port.
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, entries: [] },
})
try {
  const load = (name) => server.ssrLoadModule(`/src/domain/${name}.ts`)
  const { GAME_VERSION_REGISTRY } = await load('game-version')
  const { parseReferenceDatabase } = await load('reference-database.schema')
  const { buildReferenceDatabaseIndex, searchReferenceItems } = await load(
    'reference-database-index',
  )
  const { createCatalogCalculationSnapshot } = await load('calculations')
  const { createCatalogDisenchantSnapshot } = await load('disenchanting-catalog')
  const { matchesItemName } = await load('item-names')
  const { referenceItemToImport } = await load('reference-database-import')
  const { DEFAULT_TSM_SETTINGS } = await load('tsm')
  const inputs = []
  const queries = ['', 'ткань', 'essence', '  ГРЁЗ  ', 'zz-no-match']

  function makeCatalog(db, recipeLimit) {
    const catalog = {}
    const recipes = Object.values(db.recipes).slice(0, recipeLimit)
    const ids = new Set(
      recipes.flatMap((recipe) => [
        recipe.productItemId,
        ...recipe.reagents.map(({ itemId }) => itemId),
      ]),
    )
    for (const itemId of ids) {
      const imported = referenceItemToImport(db.items[String(itemId)], db.gameVersion)
      catalog[String(itemId)] = {
        ...imported,
        id: String(itemId),
        source: { wowheadItemId: itemId, wowheadVersion: db.gameVersion },
        sections: ['crafts', 'reagents', 'disenchanting'],
        purchasePriceCopper: itemId % 19 === 0 ? null : (itemId * 17) % 10000,
        salePriceCopper: (itemId * 31) % 15000,
        recipe: null,
      }
    }
    for (const recipe of recipes) {
      const item = catalog[String(recipe.productItemId)]
      // A deterministic DAG of client-table candidates, not a user export:
      // candidate output is synthetic, and descending ID edges exclude cycles.
      if (item.recipe || recipe.reagents.some((r) => r.itemId >= recipe.productItemId))
        continue
      item.recipe = {
        profession: recipe.profession,
        outputQuantity:
          recipe.output.quantity ?? recipe.output.baseQuantityCandidate ?? 1,
        reagents: recipe.reagents.map(({ itemId, quantity }) => ({
          itemId: String(itemId),
          quantity,
          acquisition: 'auto',
        })),
      }
    }
    return catalog
  }

  for (const [version, definition] of Object.entries(GAME_VERSION_REGISTRY)) {
    const file = values.full
      ? `data-preparation/releases/${version}/craftcalc-db.${definition.build}.json`
      : `public/${definition.databasePath}`
    const raw = measure(`${version}/read`, () => readFileSync(file, 'utf8'))
    const value = measure(`${version}/json-parse`, () => JSON.parse(raw))
    const db = measure(`${version}/validate`, () =>
      parseReferenceDatabase(value, version),
    )
    const index = measure(
      `${version}/index`,
      () => buildReferenceDatabaseIndex(db).database,
    )
    const searchIndex = buildReferenceDatabaseIndex(index)
    inputs.push({
      version,
      file,
      sha256: hash(raw),
      runtimeHash: hash(JSON.stringify(db)),
      bytes: Buffer.byteLength(raw),
      gzipBytes: gzipSync(raw).length,
      brotliBytes: brotliCompressSync(raw).length,
    })
    for (const language of ['ru', 'en']) {
      measure(`${version}/reference-search-${language}`, () =>
        queries.flatMap((query) =>
          ['crafts', 'reagents', 'disenchanting'].map((section) =>
            searchReferenceItems(searchIndex, section, query, null, language).map(
              ({ itemId }) => itemId,
            ),
          ),
        ),
      )
    }
    for (const [size, limit] of [
      ['small', 100],
      ['large', Infinity],
    ]) {
      const catalog = makeCatalog(db, limit)
      const ids = Object.keys(catalog)
      const professions = new Set(definition.professions)
      const prices = {
        version,
        settings: DEFAULT_TSM_SETTINGS,
        snapshot: null,
      }
      inputs.push({
        version,
        size,
        catalogHash: hash(JSON.stringify(catalog)),
        items: ids.length,
        recipes: Object.values(catalog).filter(({ recipe }) => recipe).length,
        professions: [...professions],
        prices,
      })
      measure(`${version}/${size}/catalog`, () =>
        createCatalogCalculationSnapshot(catalog, professions, new Set(ids), prices),
      )
      const equipmentIds = ids.filter(
        (id) => catalog[id].classId === 2 || catalog[id].classId === 4,
      )
      measure(`${version}/${size}/disenchant`, () =>
        createCatalogDisenchantSnapshot(
          catalog,
          version,
          equipmentIds,
          professions,
          prices,
        ),
      )
      measure(`${version}/${size}/catalog-search`, () =>
        queries.map((query) =>
          Object.values(catalog)
            .filter((item) => matchesItemName(item, query))
            .map(({ id }) => id),
        ),
      )
    }
  }
  const sharedCatalog = {}
  for (let i = 0; i < 210; i++) {
    const id = `shared-${i}`
    sharedCatalog[id] = {
      id,
      name: id,
      iconUrl: '',
      sections: ['crafts'],
      purchasePriceCopper: 1000,
      salePriceCopper: 2000,
      recipe:
        i === 0
          ? null
          : {
              profession: 'tailoring',
              outputQuantity: 2,
              reagents: [
                {
                  itemId: `shared-${Math.min(i - 1, 9)}`,
                  quantity: 3,
                  acquisition: 'auto',
                },
              ],
            },
    }
  }
  const sharedProfessions = new Set(['tailoring'])
  const sharedIds = new Set(Object.keys(sharedCatalog))
  inputs.push({
    size: 'shared-chain',
    items: sharedIds.size,
    catalogHash: hash(JSON.stringify(sharedCatalog)),
  })
  measure('shared-chain/catalog', () =>
    createCatalogCalculationSnapshot(sharedCatalog, sharedProfessions, sharedIds),
  )
  const report = {
    timestamp: new Date().toISOString(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    environment: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
    },
    iterations,
    warmups,
    queries,
    inputs,
    results,
  }
  if (values.compare) {
    const baseline = JSON.parse(readFileSync(values.compare, 'utf8'))
    assert.deepEqual(
      inputs.map((input) => ({ ...input, file: undefined })),
      baseline.inputs.map((input) => ({ ...input, file: undefined })),
      'Benchmark inputs changed (file location may differ)',
    )
    assert.deepEqual(
      results.map(({ name, resultHash }) => ({ name, resultHash })),
      baseline.results.map(({ name, resultHash }) => ({ name, resultHash })),
      'Benchmark results changed',
    )
    console.log('Input and result hashes match the baseline.')
  }
  if (values.output) {
    writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n')
    execFileSync(process.execPath, [
      'node_modules/prettier/bin/prettier.cjs',
      values.output,
      '--write',
    ])
  }
} finally {
  await server.close()
}
