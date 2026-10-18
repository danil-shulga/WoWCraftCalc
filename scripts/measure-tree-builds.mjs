import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { build } from 'vite'

// Both bundles use today's identical harness and fixtures. Only the baseline's
// runtime modules are loaded from Git; the working tree is never replaced.
// This comparison covers the modules below, not an arbitrary historical app:
// extend the list if related runtime dependencies change in a later comparison.
const ref = process.argv[2] ?? 'HEAD'
const baselineRef = execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' }).trim()
const runtimeFiles = [
  'src/pages/ItemsPage.tsx',
  'src/pages/ItemsPage.css',
  'src/pages/useRootItemDrag.ts',
  'src/components/item-tree/ItemTree/ItemTree.tsx',
  'src/components/ui/ItemName/ItemName.tsx',
  'src/features/item-editor/useBulkPriceDraft.ts',
]
const originals = new Map(
  runtimeFiles.map((file) => [
    file,
    execFileSync('git', ['show', `${baselineRef}:${file}`], { encoding: 'utf8' }),
  ]),
)
const checksum = (source) => createHash('sha256').update(source).digest('hex')
const sources = []
for (const file of runtimeFiles) {
  sources.push({
    file,
    before: checksum(originals.get(file)),
    after: checksum(await readFile(file)),
  })
}
for (const variant of ['before', 'after']) {
  await build({
    plugins:
      variant === 'before'
        ? [
            {
              name: 'tree-benchmark-baseline',
              enforce: 'pre',
              load(id) {
                return originals.get(
                  relative(process.cwd(), id.split('?')[0]).replaceAll('\\', '/'),
                )
              },
            },
          ]
        : [],
    build: {
      outDir: `dist/tree-${variant}`,
      rollupOptions: { input: resolve('src/test/items-page-benchmark.html') },
    },
  })
}
const manifest = {
  baselineRef,
  production: true,
  sources,
  harness: checksum(await readFile('src/test/items-page-benchmark.tsx')),
  fixture: checksum(await readFile('src/test/performance-catalog.ts')),
  urls: ['before', 'after'].map(
    (variant) =>
      `http://localhost:5174/dist/tree-${variant}/src/test/items-page-benchmark.html`,
  ),
}
await writeFile('dist/tree-builds.json', `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify(manifest, null, 2))
