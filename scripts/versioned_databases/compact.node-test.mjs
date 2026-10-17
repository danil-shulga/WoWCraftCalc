import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { prepareBrowserDatabases } from './compact.mjs'
import { databaseSchema } from './contract.mjs'

const fullPaths = [
  'data-preparation/releases/classic/craftcalc-db.1.14.4.51829.json',
  'data-preparation/releases/tbc/craftcalc-db.2.5.6.69795.json',
  'data-preparation/releases/forever/craftcalc-db.1.60.1.70338.json',
]

test('browser release is reproducible, matches published bytes and preserves full artifacts', async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'craftcalc-compact-'))
  try {
    const before = fullPaths.map((file) => readFileSync(file))
    const manifest = await prepareBrowserDatabases(fullPaths, temporary)
    assert.deepStrictEqual(await prepareBrowserDatabases(fullPaths, temporary), manifest)
    for (const [index, entry] of manifest.entries()) {
      const full = before[index]
      const browser = readFileSync(path.join(temporary, entry.file))
      assert.deepStrictEqual(readFileSync(fullPaths[index]), full)
      assert.deepStrictEqual(readFileSync(`public/data/${entry.file}`), browser)
      assert.equal(entry.fullSha256, createHash('sha256').update(full).digest('hex'))
      assert.equal(entry.sha256, createHash('sha256').update(browser).digest('hex'))
      assert.equal(entry.fullBytes, full.length)
      assert.equal(entry.bytes, browser.length)
      assert.equal(entry.runtimeEquivalent, true)
      assert(browser.length < full.length)
      assert.equal(browser.toString().trim().split('\n').length, 1)
      // The full preparation contract remains strict, rather than accepting projections.
      assert.throws(() => databaseSchema.parse(JSON.parse(browser.toString())))
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('invalid full input or duplicate version prevents all output writes', async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'craftcalc-compact-'))
  try {
    const invalidPath = path.join(temporary, 'invalid.json')
    const output = path.join(temporary, 'browser')
    const original = JSON.parse(readFileSync(fullPaths[1], 'utf8'))
    const mutations = [
      (db) => (db.build = 'wrong'),
      (db) => (db.sources[0].sha256 = 'wrong'),
      (db) => (db.items['2302'].recipeSpellIds = []),
      (db) => (db.items['2302'].requiredLevel = -1),
      (db) => (db.statistics.items = 0),
    ]
    for (const mutate of mutations) {
      const invalid = structuredClone(original)
      mutate(invalid)
      writeFileSync(invalidPath, JSON.stringify(invalid))
      await assert.rejects(prepareBrowserDatabases([fullPaths[0], invalidPath], output))
      assert.equal(existsSync(output), false)
    }
    await assert.rejects(
      prepareBrowserDatabases([fullPaths[0], fullPaths[0]], output),
      /Duplicate game version/,
    )
    assert.equal(existsSync(output), false)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
