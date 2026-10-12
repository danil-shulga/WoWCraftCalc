import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { parseTooltip } from './verify-samples.mjs'

test('sample parser keeps explicit output and separates tools from reagents', () => {
  const payload = JSON.parse(
    readFileSync('src/features/wowhead-import/fixtures/classic-25146-en.json', 'utf8'),
  )
  const parsed = parseTooltip(payload, 'classic')
  assert.equal(parsed.productItemId, 7068)
  assert.equal(parsed.explicitOutputQuantity, 3)
  assert.deepEqual(parsed.reagents, [{ itemId: 7077, quantity: 1 }])
  assert.equal(parsed.toolReferences[0].itemId, 9149)
})

test('sample parser rejects wrong versions and a lost ingredient link', () => {
  const payload = JSON.parse(
    readFileSync('src/features/wowhead-import/fixtures/forever-1257390-en.json', 'utf8'),
  )
  assert.equal(parseTooltip(payload, 'forever').explicitOutputQuantity, 2)
  assert.throws(() => parseTooltip(payload, 'tbc'))
  payload.tooltip = payload.tooltip.replace(
    /<a href="\/forever\/item=2321\/fine-thread">Fine Thread<\/a>/,
    'Fine Thread',
  )
  assert.throws(() => parseTooltip(payload, 'forever'))
})
