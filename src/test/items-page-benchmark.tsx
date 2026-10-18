import { Profiler, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { ItemsPage } from '../pages/ItemsPage'
import { Button } from '../components/ui/Button/Button'
import { useCraftStore } from '../store/useCraftStore'
import { STORAGE_KEY } from '../store/persistence'
import { testCraftData } from './craft-state'
import {
  createPerformanceCatalog,
  createTreePerformanceCatalog,
} from './performance-catalog'
import '../styles/global.css'
import '../app/App.css'

// This entry is served only by Vite on demand; index.html does not import it.
// Keep the browser's catalog intact while exercising real store actions in memory.
useCraftStore.persist.setOptions({
  storage: {
    getItem: () => null,
    setItem: () => {
      /* Замер не сохраняет каталог. */
    },
    removeItem: () => {
      /* Замер не удаляет сохранённые данные. */
    },
  },
})
const storedCatalog = localStorage.getItem(STORAGE_KEY)
const catalog = createPerformanceCatalog()
// Embed a valid image: relative fallbacks and failed network/asset loads must
// not contribute work to the rendering benchmark.
const iconUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#26324a"/><path d="M22 22h20v20H22z" fill="#94a3b8"/></svg>')}`
for (const item of Object.values(catalog)) item.iconUrl = iconUrl
const targets = Object.keys(catalog)
  .filter((id) => id !== 'material')
  .map((itemId) => ({ itemId, quantity: 1 }))
const data = testCraftData({ items: catalog, ownedProfessions: ['tailoring'] })
data.workspaces.forever.planner = { targets }
const queries = [
  'Test product 00',
  'zz-no-match',
  'Test product 0',
  'Test product 099',
  '',
]
const samples = 20
const warmups = 3
let renderMs = 0
let commits = 0

function element(id: string) {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Нет элемента ${id}`)
  return found
}
const pageRoot = createRoot(element('page'))

function showPage(key: number, section: 'crafts' | 'reagents' | 'favorites' = 'crafts') {
  flushSync(() => {
    pageRoot.render(
      <Profiler
        id="ItemsPage"
        onRender={(_id, _phase, duration) => {
          renderMs += duration
          commits++
        }}
      >
        <ItemsPage key={key} section={section} />
      </Profiler>,
    )
  })
}

function changeQuery(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="search"]')
  if (!input) throw new Error('Нет поиска')
  const valueDescriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )
  if (!valueDescriptor?.set) throw new Error('Нет сеттера поля')
  flushSync(() => {
    valueDescriptor.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  // Check that the event reached React, not just the native input.
  const expected =
    value === 'zz-no-match'
      ? 0
      : value === 'Test product 099'
        ? 1
        : value === 'Test product 00'
          ? 10
          : 100
  if (document.querySelectorAll('.root-item-row').length !== expected)
    throw new Error('Поиск не обновил строки')
}

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })

function toggleRow(row: HTMLElement) {
  // Synthetic Pointer Events include the drag candidate path; browser input is
  // checked separately. click() alone would miss pointerdown geometry reads.
  flushSync(() => {
    row.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }),
    )
    row.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1 }),
    )
    row.click()
  })
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

async function measureTreeToggle(row: HTMLElement) {
  const opening = row.getAttribute('aria-expanded') !== 'true'
  const intervals: number[] = []
  renderMs = 0
  commits = 0
  const start = performance.now()
  let previous = start
  let observationStart: number | undefined
  const frames = new Promise<void>((resolve) => {
    const tick = () => {
      const now = performance.now()
      observationStart ??= now
      intervals.push(now - previous)
      previous = now
      if (now - observationStart >= 250) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  toggleRow(row)
  const eventMs = performance.now() - start
  await frames
  return {
    opening,
    eventMs,
    renderMs,
    commits,
    firstFrameMs: intervals[0] ?? 0,
    maxFrameMs: Math.max(...intervals),
    frameIntervals: intervals,
  }
}

export function Controls() {
  const [status, setStatus] = useState('Готово к замеру')
  const [report, setReport] = useState('')
  const [running, setRunning] = useState(false)
  async function runTrees() {
    setRunning(true)
    try {
      const results = []
      const cases = [
        { roots: 100, section: 'reagents', depth: 3, width: 3 },
        { roots: 1000, section: 'reagents', depth: 3, width: 3 },
        { roots: 1000, section: 'favorites', depth: 3, width: 3 },
        { roots: 1000, section: 'reagents', depth: 12, width: 3 },
        { roots: 1000, section: 'reagents', depth: 1, width: 40 },
      ] as const
      for (const [caseIndex, config] of cases.entries()) {
        const treeCatalog = createTreePerformanceCatalog(
          config.roots,
          config.depth,
          config.width,
        )
        for (const item of Object.values(treeCatalog)) item.iconUrl = iconUrl
        flushSync(() => {
          useCraftStore.setState(testCraftData({ items: treeCatalog }))
        })
        showPage(10000 + caseIndex, config.section)
        // Do not include initial list entrance or mounting in toggle samples.
        await new Promise((resolve) => setTimeout(resolve, 200))
        const roots = document.querySelectorAll<HTMLElement>('.root-item-row')
        for (const root of Array.from(roots).slice(1, 9)) toggleRow(root)
        const row = roots[0]
        if (!row) throw new Error('Нет корневой строки')
        toggleRow(row)
        for (let level = 0; level < config.depth; level++) {
          const branch = row
            .closest('.item-tree')
            ?.querySelector<HTMLElement>('.reagent-item-row[aria-expanded="false"]')
          if (branch) toggleRow(branch)
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
        const readings: Awaited<ReturnType<typeof measureTreeToggle>>[] = []
        for (let index = 0; index < samples + warmups; index++) {
          setStatus(
            `Дерево ${String(caseIndex + 1)}/${String(cases.length)}: ${String(index + 1)}/${String(samples + warmups)}`,
          )
          await nextFrame()
          const reading = await measureTreeToggle(row)
          if (index >= warmups) readings.push(reading)
        }
        results.push({
          ...config,
          medianEventMs: percentile(
            readings.map((reading) => reading.eventMs),
            0.5,
          ),
          p95EventMs: percentile(
            readings.map((reading) => reading.eventMs),
            0.95,
          ),
          medianRenderMs: import.meta.env.DEV
            ? percentile(
                readings.map((reading) => reading.renderMs),
                0.5,
              )
            : null,
          p95FirstFrameMs: percentile(
            readings.map((reading) => reading.firstFrameMs),
            0.95,
          ),
          p95MaxFrameMs: percentile(
            readings.map((reading) => reading.maxFrameMs),
            0.95,
          ),
          p95FrameMs: percentile(
            readings.flatMap((reading) => reading.frameIntervals),
            0.95,
          ),
          readings,
        })
      }
      setReport(
        JSON.stringify(
          {
            userAgent: navigator.userAgent,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            samples,
            warmups,
            input:
              'synthetic pointerdown/pointerup/click; first RAF delay and 250 ms RAF observation after first frame',
            reactProfiling: import.meta.env.DEV,
            storageUnchanged: storedCatalog === localStorage.getItem(STORAGE_KEY),
            results,
          },
          null,
          2,
        ),
      )
      setStatus('Замер дерева завершён')
      flushSync(() => {
        pageRoot.render(null)
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setRunning(false)
    }
  }
  async function run() {
    setRunning(true)
    try {
      const results: {
        scenario: string
        medianMs: number
        p95Ms: number
        minMs: number
        maxMs: number
        medianRenderMs: number
        commits: number[]
      }[] = []
      for (const scenario of ['mount', 'search', 'plan-update', 'price-update']) {
        const times: number[] = []
        const renders: number[] = []
        const commitCounts: number[] = []
        for (let index = 0; index < samples + warmups; index++) {
          setStatus(`${scenario}: ${String(index + 1)}/${String(samples + warmups)}`)
          flushSync(() => {
            useCraftStore.setState(data)
          })
          showPage(index + 100 * results.length)
          await nextFrame()
          renderMs = 0
          commits = 0
          const start = performance.now()
          if (scenario === 'mount') showPage(index + 1000)
          else if (scenario === 'search') queries.forEach(changeQuery)
          else if (scenario === 'plan-update')
            flushSync(() => {
              useCraftStore.getState().setPlannerQuantity('product-099', 2)
            })
          else {
            changeQuery('Test product 099')
            renderMs = 0
            commits = 0
          }
          const priceStart = performance.now()
          if (scenario === 'price-update')
            flushSync(() => {
              useCraftStore.getState().setItemPrice('material', 'purchasePriceCopper', 20)
            })
          const duration =
            performance.now() - (scenario === 'price-update' ? priceStart : start)
          if (index >= warmups) {
            times.push(duration)
            renders.push(renderMs)
            commitCounts.push(commits)
          }
        }
        times.sort((a, b) => a - b)
        renders.sort((a, b) => a - b)
        results.push({
          scenario,
          medianMs: times[10] ?? 0,
          p95Ms: times[18] ?? 0,
          minMs: times[0] ?? 0,
          maxMs: times.at(-1) ?? 0,
          medianRenderMs: renders[10] ?? 0,
          commits: commitCounts,
        })
      }
      setReport(
        JSON.stringify(
          {
            userAgent: navigator.userAgent,
            productCount: targets.length,
            samples,
            warmups,
            queries,
            storageUnchanged: storedCatalog === localStorage.getItem(STORAGE_KEY),
            results,
          },
          null,
          2,
        ),
      )
      setStatus('Замер завершён')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setRunning(false)
    }
  }
  return (
    <>
      <Button
        type="button"
        disabled={running}
        onClick={() => {
          void run()
        }}
      >
        Запустить замер
      </Button>
      <Button
        type="button"
        disabled={running}
        onClick={() => {
          void runTrees()
        }}
      >
        Замерить раскрытие дерева
      </Button>
      <p id="status">{status}</p>
      <pre id="report">{report}</pre>
    </>
  )
}

createRoot(element('controls')).render(<Controls />)
