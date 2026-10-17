import { Profiler, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { ItemsPage } from '../pages/ItemsPage'
import { Button } from '../components/ui/Button/Button'
import { useCraftStore } from '../store/useCraftStore'
import { STORAGE_KEY } from '../store/persistence'
import { testCraftData } from './craft-state'
import { createPerformanceCatalog } from './performance-catalog'
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

function showPage(key: number) {
  flushSync(() => {
    pageRoot.render(
      <Profiler
        id="ItemsPage"
        onRender={(_id, _phase, duration) => {
          renderMs += duration
          commits++
        }}
      >
        <ItemsPage key={key} section="crafts" />
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

export function Controls() {
  const [status, setStatus] = useState('Готово к замеру')
  const [report, setReport] = useState('')
  const [running, setRunning] = useState(false)
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
      <p id="status">{status}</p>
      <pre id="report">{report}</pre>
    </>
  )
}

createRoot(element('controls')).render(<Controls />)
