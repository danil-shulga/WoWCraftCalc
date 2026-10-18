import { create } from 'zustand'
import { useMemo } from 'react'
import { useCraftStore } from '../../store/useCraftStore'
import { supportsTsm, tsmMarketKey } from '../../domain/tsm'
import { selectActivePricing } from '../../store/craft.selectors'
import type { PriceContext, TsmMarket, TsmSnapshot } from '../../domain/tsm'
import { loadTsmSnapshot, pruneTsmCache, readTsmCache, writeTsmCache } from './tsm-loader'

export const TSM_CHECK_INTERVAL = 15 * 60 * 1000
export interface TsmState {
  scope: string | null
  snapshot: TsmSnapshot | null
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
  error: string | null
  cacheError: string | null
  loadedAt: number | null
}
export const useTsmStore = create<TsmState>(() => ({
  scope: null,
  snapshot: null,
  status: 'idle',
  error: null,
  cacheError: null,
  loadedAt: null,
}))
function currentScope(): string | null {
  const state = useCraftStore.getState()
  const market = selectActivePricing(state).market
  return supportsTsm(state.activeVersion) && market
    ? `${String(state.workspaceRevision)}:${tsmMarketKey(market)}`
    : null
}
function configuredMarkets(): TsmMarket[] {
  const state = useCraftStore.getState()
  return [state.tbcPricing.market, state.classicPricing.market].filter(
    (market): market is TsmMarket => market !== null,
  )
}
let activeRequest: AbortController | null = null
let lastCheck = 0
export async function checkTsmUpdate(): Promise<void> {
  const scope = currentScope()
  const market = selectActivePricing(useCraftStore.getState()).market
  const cacheError = pruneTsmCache(market, configuredMarkets())
  if (!scope || !market) return
  activeRequest?.abort()
  const controller = new AbortController()
  activeRequest = controller
  lastCheck = Date.now()
  const current = useTsmStore.getState()
  const snapshot = current.scope === scope ? current.snapshot : readTsmCache(market)
  useTsmStore.setState({
    scope,
    snapshot,
    status: 'loading',
    error: null,
    cacheError,
    loadedAt: current.scope === scope ? current.loadedAt : null,
  })
  const isCurrent = () =>
    !controller.signal.aborted && currentScope() === scope && activeRequest === controller
  const timer = setTimeout(() => {
    controller.abort()
    if (currentScope() === scope && activeRequest === controller)
      useTsmStore.setState({
        status: 'error',
        error: 'Загрузка TSM заняла слишком много времени. Повторите проверку.',
      })
  }, 20000)
  try {
    const loaded = await loadTsmSnapshot(market, snapshot, controller.signal)
    if (!isCurrent()) return
    useTsmStore.setState({
      snapshot: loaded ?? snapshot,
      status: loaded ? 'ready' : 'unavailable',
      loadedAt: Date.now(),
      cacheError: loaded ? writeTsmCache(loaded, configuredMarkets()) : cacheError,
    })
  } catch (error) {
    if (isCurrent())
      useTsmStore.setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Не удалось загрузить цены TSM.',
      })
  } finally {
    clearTimeout(timer)
    if (activeRequest === controller) activeRequest = null
  }
}

export function startTsmClient(): () => void {
  let scope: string | null | undefined
  let marketKey: string | null | undefined
  const sync = () => {
    const market = selectActivePricing(useCraftStore.getState()).market
    const markets = configuredMarkets()
    const nextMarketKey = markets.map(tsmMarketKey).join(':')
    if (marketKey !== nextMarketKey) {
      marketKey = nextMarketKey
      useTsmStore.setState({ cacheError: pruneTsmCache(market, markets) })
    }
    const next = currentScope()
    if (scope === next) return
    scope = next
    activeRequest?.abort()
    activeRequest = null
    useTsmStore.setState({
      scope: null,
      snapshot: null,
      status: 'idle',
      error: null,
      cacheError: useTsmStore.getState().cacheError,
      loadedAt: null,
    })
    if (next) void checkTsmUpdate()
  }
  sync()
  const unsubscribe = useCraftStore.subscribe(sync)
  const checkIfDue = () => {
    if (
      document.visibilityState === 'visible' &&
      Date.now() - lastCheck >= TSM_CHECK_INTERVAL
    )
      void checkTsmUpdate()
  }
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') void checkTsmUpdate()
  }, TSM_CHECK_INTERVAL)
  document.addEventListener('visibilitychange', checkIfDue)
  return () => {
    unsubscribe()
    clearInterval(timer)
    document.removeEventListener('visibilitychange', checkIfDue)
    activeRequest?.abort()
    activeRequest = null
  }
}

export function usePriceContext(): PriceContext {
  const version = useCraftStore((state) => state.activeVersion)
  const revision = useCraftStore((state) => state.workspaceRevision)
  const settings = useCraftStore(selectActivePricing)
  const snapshot = useTsmStore((state) => state.snapshot)
  const scope = useTsmStore((state) => state.scope)
  const expected =
    supportsTsm(version) && settings.market
      ? `${String(revision)}:${tsmMarketKey(settings.market)}`
      : null
  return useMemo(
    () => ({
      version,
      settings,
      snapshot: expected && scope === expected ? snapshot : null,
    }),
    [version, settings, expected, scope, snapshot],
  )
}
