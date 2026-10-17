import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { cpus, platform } from 'node:os'
import { performance } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import { createServer } from 'vite'

const { values } = parseArgs({
  options: {
    output: { type: 'string' },
    compare: { type: 'string' },
    full: { type: 'boolean', default: false },
  },
})
const hash = (value) => createHash('sha256').update(value).digest('hex')
const queries = ['', 'ткань', 'essence', '  ГРЁЗ  ', 'zz-no-match']
const inputs = []
const results = []
const preparations = []
function measure(run) {
  for (let i = 0; i < 3; i++) run()
  const times = []
  let value
  for (let i = 0; i < 20; i++) {
    const start = performance.now()
    value = run()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return {
    value,
    stats: {
      medianMs: times[10],
      p95Ms: times[18],
      minMs: times[0],
      maxMs: times.at(-1),
    },
  }
}
function record(name, run) {
  const { value, stats } = measure(run)
  const result = { name, ...stats, resultHash: hash(JSON.stringify(value)) }
  results.push(result)
  console.log(`${name}: median=${stats.medianMs.toFixed(3)} ms`)
  return result
}
function retained(run) {
  global.gc?.()
  const before = process.memoryUsage().heapUsed
  const value = run()
  global.gc?.()
  return { value, heapBytes: global.gc ? process.memoryUsage().heapUsed - before : null }
}

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
  const { getItemName, getItemSearchNames, normalizeItemName, matchesItemName } =
    await load('item-names')
  for (const [version, definition] of Object.entries(GAME_VERSION_REGISTRY)) {
    const file = values.full
      ? `data-preparation/releases/${version}/craftcalc-db.${definition.build}.json`
      : `public/${definition.databasePath}`
    const raw = readFileSync(file, 'utf8')
    const db = parseReferenceDatabase(JSON.parse(raw), version)
    const buildStats = measure(() => {
      buildReferenceDatabaseIndex(db)
      return null
    }).stats
    const { value: index, heapBytes: indexHeapBytes } = retained(() =>
      buildReferenceDatabaseIndex(db),
    )
    const catalog = Object.values(db.items).map((item) => ({
      id: String(item.itemId),
      name: getItemName({ name: String(item.itemId), names: item.names }),
      names: item.names,
    }))
    const prepareNames = () =>
      new Map(
        catalog.map((item) => [item.id, getItemSearchNames(item).map(normalizeItemName)]),
      )
    const catalogPrepareStats = measure(() => {
      prepareNames()
      return null
    }).stats
    const { value: names, heapBytes: catalogHeapBytes } = retained(prepareNames)
    inputs.push({
      version,
      file,
      sourceSha256: hash(raw),
      catalogHash: hash(JSON.stringify(catalog)),
      queries,
      professions: definition.professions,
    })
    preparations.push({
      version,
      buildStats,
      indexHeapBytes,
      catalogPrepareStats,
      catalogHeapBytes,
      sortedIdSlots: index.sortedItemIds
        ? Object.values(index.sortedItemIds)
            .flatMap(Object.values)
            .reduce((sum, ids) => sum + ids.length, 0)
        : 0,
    })
    for (const language of ['ru', 'en']) {
      record(`${version}/reference-${language}`, () =>
        queries.flatMap((query) =>
          ['crafts', 'reagents', 'disenchanting'].flatMap((section) =>
            [null, ...definition.professions].map((profession) =>
              searchReferenceItems(index, section, query, profession, language).map(
                ({ itemId }) => itemId,
              ),
            ),
          ),
        ),
      )
    }
    const legacy = record(`${version}/catalog-direct`, () =>
      queries.map((query) =>
        catalog.filter((item) => matchesItemName(item, query)).map(({ id }) => id),
      ),
    )
    const prepared = record(`${version}/catalog-prepared`, () =>
      queries.map((query) => {
        const normalized = normalizeItemName(query)
        return catalog
          .filter(({ id }) => names.get(id)?.some((name) => name.includes(normalized)))
          .map(({ id }) => id)
      }),
    )
    assert.equal(prepared.resultHash, legacy.resultHash, 'Catalog search changed')
  }
  if (values.compare) {
    const before = JSON.parse(readFileSync(values.compare, 'utf8'))
    assert.deepEqual(
      inputs.map((input) => ({ ...input, file: undefined })),
      before.inputs.map((input) => ({ ...input, file: undefined })),
      'Search inputs changed (file location may differ)',
    )
    assert.deepEqual(
      results.map(({ name, resultHash }) => ({ name, resultHash })),
      before.results.map(({ name, resultHash }) => ({ name, resultHash })),
      'Search order or results changed',
    )
    console.log('Search inputs, results and order match the baseline.')
  }
  if (values.output) {
    writeFileSync(
      values.output,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          revision: execFileSync('git', ['rev-parse', 'HEAD'], {
            encoding: 'utf8',
          }).trim(),
          environment: {
            node: process.version,
            platform: platform(),
            cpu: cpus()[0]?.model,
          },
          iterations: 20,
          warmups: 3,
          inputs,
          preparations,
          results,
        },
        null,
        2,
      ) + '\n',
    )
    execFileSync(process.execPath, [
      'node_modules/prettier/bin/prettier.cjs',
      values.output,
      '--write',
    ])
  }
} finally {
  await server.close()
}
