import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { JSDOM } from 'jsdom'

import { databaseSchema } from './contract.mjs'

const samples = {
  classic: [2330, 2675, 12092, 25146],
  tbc: [28555, 31048, 2675],
  forever: [1244431, 1257390, 1257383],
}
const userAgent = 'CraftCalc data preparation/1.0'

function save(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
  if (file.startsWith('data-preparation/reports/')) {
    execFileSync('node', ['node_modules/prettier/bin/prettier.cjs', file, '--write'])
  }
}

async function cachedTooltip(version, spellId) {
  const file = `data-preparation/cache/${version}/spell-${spellId}.json`
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const url = `https://nether.wowhead.com/${version}/tooltip/spell/${spellId}`
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok || response.url !== url)
    throw new Error(`${url}: HTTP ${response.status} / unexpected redirect`)
  const value = await response.json()
  save(file, value)
  return value
}

function sectionTitle(container) {
  let node = container.previousSibling
  while (node !== null) {
    const text = node.textContent.trim()
    if (node.nodeName !== 'BR' && text) return text
    node = node.previousSibling
  }
  return ''
}

function itemId(anchor, version) {
  const href = anchor.getAttribute('href')
  const match = new RegExp(`^/${version}/item=(\\d+)(?:/|$)`).exec(href ?? '')
  if (!match) throw new Error('Wrong version/item link in sampled tooltip')
  return Number(match[1])
}

export function parseTooltip(payload, version) {
  if (typeof payload.tooltip !== 'string') throw new Error('Invalid sampled tooltip')
  const document = new JSDOM(payload.tooltip).window.document
  const containers = [...document.querySelectorAll('.indent')]
  const reagentContainers = containers.filter((c) => sectionTitle(c) === 'Reagents:')
  if (reagentContainers.length !== 1) throw new Error('Ambiguous sampled reagents')
  const reagents = [...reagentContainers[0].querySelectorAll('a')].map((anchor) => {
    let node = anchor.nextSibling
    let text = ''
    while (node !== null && node.nodeName !== 'A') {
      text += node.textContent
      node = node.nextSibling
    }
    const match = /^\s*(?:\((\d+)\))?\s*,?\s*$/.exec(text)
    if (!match) throw new Error('Invalid sampled reagent quantity')
    return {
      itemId: itemId(anchor, version),
      quantity: match[1] === undefined ? 1 : Number(match[1]),
    }
  })
  const residue = reagentContainers[0].cloneNode(true)
  residue.querySelectorAll('a').forEach((a) => a.remove())
  if (residue.textContent.replace(/\(\d+\)|[\s,]/g, ''))
    throw new Error('Unexpected text in sampled reagents')
  const product = [...document.querySelectorAll('span > a')].find((a) =>
    /item=/.test(a.getAttribute('href') ?? ''),
  )
  if (!product) throw new Error('Missing sampled product')
  const outputMatch = /^\s*\((\d+)\)\s*$/.exec(
    product.parentElement.nextSibling?.textContent ?? '',
  )
  const tools = containers
    .filter((c) => sectionTitle(c) === 'Tools:')
    .flatMap((c) =>
      [...c.querySelectorAll('a')].map((a) => ({
        href: a.getAttribute('href'),
        itemId: /item=/.test(a.getAttribute('href') ?? '') ? itemId(a, version) : null,
      })),
    )
  return {
    productItemId: itemId(product, version),
    productNameEn: product.textContent.trim(),
    reagents,
    toolReferences: tools,
    explicitOutputQuantity: outputMatch ? Number(outputMatch[1]) : null,
  }
}

async function main() {
  for (const file of process.argv.slice(2)) {
    const db = databaseSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    const results = []
    for (const spellId of samples[db.gameVersion]) {
      const parsed = parseTooltip(
        await cachedTooltip(db.gameVersion, spellId),
        db.gameVersion,
      )
      const recipe = db.recipes[spellId]
      const sorted = (rows) => [...rows].sort((a, b) => a.itemId - b.itemId)
      const matches =
        recipe.productItemId === parsed.productItemId &&
        db.items[parsed.productItemId].names.en === parsed.productNameEn &&
        JSON.stringify(sorted(recipe.reagents)) ===
          JSON.stringify(sorted(parsed.reagents))
      results.push({
        spellId,
        source: `https://www.wowhead.com/${db.gameVersion}/spell=${spellId}`,
        endpoint: `https://nether.wowhead.com/${db.gameVersion}/tooltip/spell/${spellId}`,
        checkedOn: db.snapshotDate,
        matches,
        parsed,
        sourceToolReferences: recipe.tools,
        storedOutputQuantity: recipe.output.quantity,
        note: 'Sample confirms product and composition for the same game version. Output remains unknown in the database; current tooltip is not pinned to the historical client build. Tool category mapping is not confirmed by this sample.',
      })
      if (!matches) throw new Error(`Sample mismatch ${db.gameVersion}/${spellId}`)
    }
    const icons = []
    for (const itemId of {
      classic: [118, 2589, 2870],
      tbc: [118, 2589, 22832],
      forever: [118, 253915, 253929],
    }[db.gameVersion]) {
      const url = db.items[itemId]?.iconUrl
      if (!url) continue
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(20000),
      })
      const contentType = response.headers.get('Content-Type')
      if (!response.ok || !contentType?.startsWith('image/'))
        throw new Error(`Icon unavailable ${url}`)
      icons.push({ itemId, url, httpStatus: response.status, contentType })
    }
    save(`data-preparation/reports/samples.${db.gameVersion}.${db.build}.json`, {
      gameVersion: db.gameVersion,
      build: db.build,
      recipes: results,
      iconHttpChecks: icons,
    })
    console.log(
      `${db.gameVersion}: ${results.length} recipe samples match, ${icons.length} image HEAD checks passed`,
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main()
