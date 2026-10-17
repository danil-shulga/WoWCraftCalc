import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { createServer } from 'vite'

import { databaseSchema } from './contract.mjs'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export async function prepareBrowserDatabases(inputPaths, outputRoot) {
  if (!inputPaths.length) throw new Error('Expected full database paths')
  // Load the actual browser schema, without opening a server or duplicating fields.
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true, entries: [] },
  })
  try {
    const { parseReferenceDatabase } = await server.ssrLoadModule(
      '/src/domain/reference-database.schema.ts',
    )
    const { GAME_VERSION_REGISTRY } = await server.ssrLoadModule(
      '/src/domain/game-version.ts',
    )
    const versions = new Set()
    // Validate every input and serialized projection before writing any output.
    const prepared = inputPaths.map((inputPath) => {
      const fullBytes = readFileSync(inputPath)
      const full = JSON.parse(fullBytes.toString('utf8'))
      databaseSchema.parse(full)
      const projected = parseReferenceDatabase(full)
      assert(!versions.has(projected.gameVersion), 'Duplicate game version')
      versions.add(projected.gameVersion)
      const bytes = Buffer.from(JSON.stringify(projected) + '\n')
      assert.deepStrictEqual(
        parseReferenceDatabase(JSON.parse(bytes.toString('utf8')), projected.gameVersion),
        projected,
      )
      const definition = GAME_VERSION_REGISTRY[projected.gameVersion]
      return {
        bytes,
        metadata: {
          gameVersion: projected.gameVersion,
          build: projected.build,
          file: `${projected.gameVersion}/${path.basename(definition.databasePath)}`,
          fullSha256: sha256(fullBytes),
          fullBytes: fullBytes.length,
          sha256: sha256(bytes),
          bytes: bytes.length,
          runtimeEquivalent: true,
        },
      }
    })
    for (const { bytes, metadata } of prepared) {
      const destination = path.join(outputRoot, metadata.file)
      mkdirSync(path.dirname(destination), { recursive: true })
      writeFileSync(`${destination}.part`, bytes)
      renameSync(`${destination}.part`, destination)
    }
    const manifest = prepared.map(({ metadata }) => metadata)
    writeFileSync(
      path.join(outputRoot, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    )
    return manifest
  } finally {
    await server.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [outputRoot, ...inputPaths] = process.argv.slice(2)
  if (!outputRoot) throw new Error('Usage: compact.mjs OUTPUT_DIRECTORY FULL_JSON...')
  await prepareBrowserDatabases(inputPaths, outputRoot)
}
