import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

const source = readFileSync(
  'data-preparation/releases/tbc/craftcalc-db.2.5.6.69795.json',
  'utf8',
)
const ids = Object.keys(JSON.parse(source).items)
const reports = []
for (const count of [100, 2363]) {
  const rows = ids.slice(0, count).map((id) => ({ item: { id } }))
  const live = rows.slice(0, Math.floor(count * 0.9))
  const targets = live.map(({ item }) => ({ itemId: item.id, quantity: 3 }))
  const old = () => {
    const next = [...live]
    rows.forEach((row, index) => {
      if (!live.some(({ item }) => item.id === row.item.id))
        next.splice(Math.min(index, next.length), 0, row)
    })
    return next.map(({ item }) => ({
      id: item.id,
      removing: !live.some((row) => row.item.id === item.id),
      quantity: targets.find((target) => target.itemId === item.id)?.quantity ?? 0,
    }))
  }
  const indexed = () => {
    // Include index construction, although React reuses it between relevant changes.
    const liveIds = new Set(live.map(({ item }) => item.id))
    const byId = new Map(targets.map((target) => [target.itemId, target]))
    const next = [...live]
    rows.forEach((row, index) => {
      if (!liveIds.has(row.item.id)) next.splice(Math.min(index, next.length), 0, row)
    })
    return next.map(({ item }) => ({
      id: item.id,
      removing: !liveIds.has(item.id),
      quantity: byId.get(item.id)?.quantity ?? 0,
    }))
  }
  assert.deepEqual(indexed(), old())
  const times = { old: [], indexed: [] }
  for (let iteration = 0; iteration < 23; iteration++) {
    const cases =
      iteration % 2 === 0
        ? [
            ['old', old],
            ['indexed', indexed],
          ]
        : [
            ['indexed', indexed],
            ['old', old],
          ]
    for (const [name, run] of cases) {
      const start = performance.now()
      run()
      if (iteration >= 3) times[name].push(performance.now() - start)
    }
  }
  const results = Object.fromEntries(
    Object.entries(times).map(([name, values]) => {
      values.sort((a, b) => a - b)
      return [
        name,
        {
          medianMs: values[10],
          p95Ms: values[18],
          minMs: values[0],
          maxMs: values.at(-1),
        },
      ]
    }),
  )
  reports.push({ count, liveCount: live.length, results })
}
const output =
  process.argv[2] ?? 'data-preparation/reports/optimization/optimization-row-indexes.json'
writeFileSync(
  output,
  JSON.stringify(
    {
      node: process.version,
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      iterations: 20,
      warmups: 3,
      resultsEqual: true,
      reports,
    },
    null,
    2,
  ) + '\n',
)
execFileSync(process.execPath, [
  'node_modules/prettier/bin/prettier.cjs',
  output,
  '--write',
])
console.log(JSON.stringify(reports))
