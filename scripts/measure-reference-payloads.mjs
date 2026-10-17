import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { cpus, platform } from 'node:os'
import { performance } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { createServer } from 'vite'

const { values } = parseArgs({ options: { output: { type: 'string' } } })
const iterations = 20
const warmups = 3
const hash = (value) => createHash('sha256').update(value).digest('hex')
function measure(run) {
  for (let i = 0; i < warmups; i++) run()
  const times = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    run()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return {
    medianMs: times[Math.floor(iterations / 2)],
    p95Ms: times[Math.ceil(iterations * 0.95) - 1],
    minMs: times[0],
    maxMs: times.at(-1),
  }
}
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, entries: [] },
})
try {
  const { GAME_VERSION_REGISTRY } = await server.ssrLoadModule(
    '/src/domain/game-version.ts',
  )
  const { parseReferenceDatabase } = await server.ssrLoadModule(
    '/src/domain/reference-database.schema.ts',
  )
  const { buildReferenceDatabaseIndex } = await server.ssrLoadModule(
    '/src/domain/reference-database-index.ts',
  )
  const results = []
  for (const [version, definition] of Object.entries(GAME_VERSION_REGISTRY)) {
    const files = {
      full: `data-preparation/releases/${version}/craftcalc-db.${definition.build}.json`,
      browser: `public/${definition.databasePath}`,
    }
    const parsed = {}
    const measurements = {}
    for (const [kind, file] of Object.entries(files)) {
      const raw = readFileSync(file)
      const text = raw.toString('utf8')
      const value = JSON.parse(text)
      const database = parseReferenceDatabase(value, version)
      parsed[kind] = database
      measurements[kind] = {
        file,
        sha256: hash(raw),
        runtimeHash: hash(JSON.stringify(database)),
        bytes: raw.length,
        gzipBytes: gzipSync(raw).length,
        brotliBytes: brotliCompressSync(raw).length,
        jsonParse: measure(() => JSON.parse(text)),
        validate: measure(() => parseReferenceDatabase(value, version)),
        index: measure(() => buildReferenceDatabaseIndex(database)),
      }
    }
    assert.deepStrictEqual(parsed.browser, parsed.full)
    assert.deepStrictEqual(
      buildReferenceDatabaseIndex(parsed.browser),
      buildReferenceDatabaseIndex(parsed.full),
    )
    results.push({
      version,
      runtimeEquivalent: true,
      indexEquivalent: true,
      ...measurements,
    })
    console.log(
      `${version}: ${measurements.full.bytes} → ${measurements.browser.bytes} bytes`,
    )
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
          iterations,
          warmups,
          compression: 'Node gzip and Brotli defaults; network transfer not measured',
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
