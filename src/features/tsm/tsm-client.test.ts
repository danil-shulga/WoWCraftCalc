import { createHash, webcrypto } from 'node:crypto'
import { useCraftStore } from '../../store/useCraftStore'
import { createEmptyCraftData } from '../../store/persistence'
import type { TsmMarket, TsmSnapshot } from '../../domain/tsm'
import { tsmMarketKey } from '../../domain/tsm'
import {
  checkTsmUpdate,
  startTsmClient,
  TSM_CHECK_INTERVAL,
  useTsmStore,
} from './tsm-client'
import { loadTsmSnapshot, readTsmCache } from './tsm-loader'

const market: TsmMarket = { region: 'eu', realm: 'thunderstrike', faction: 'alliance' }
function fixture(selected = market) {
  const snapshot: TsmSnapshot = {
    schemaVersion: 1,
    market: selected,
    scannedAt: '2026-01-01T00:00:00Z',
    items: { '21877': { recent: 2322, marketValue: 1708 } },
  }
  const raw = JSON.stringify(snapshot)
  const contentId = createHash('sha256').update(raw).digest('hex')
  const entry = {
    market: selected,
    scannedAt: snapshot.scannedAt,
    contentId,
    path: `${tsmMarketKey(selected)}.${contentId}.json`,
  }
  return {
    snapshot,
    raw,
    entry,
    manifest: { schemaVersion: 1, generatedAt: '2026-01-01T00:00:00Z', markets: [entry] },
  }
}
function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value))
}
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('crypto', webcrypto)
  const data = createEmptyCraftData()
  data.activeVersion = 'tbc'
  data.tbcPricing.market = market
  useCraftStore.getState().replaceData(data)
  useTsmStore.setState({ scope: null, snapshot: null, status: 'idle', error: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it.each(['404', 'html'] as const)(
  'считает отсутствие manifest (%s) отсутствием данных, а не повреждением',
  async (kind) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        kind === '404'
          ? new Response(null, { status: 404 })
          : new Response('<!doctype html><html></html>', {
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }),
      ),
    )
    await checkTsmUpdate()
    expect(useTsmStore.getState()).toMatchObject({
      status: 'unavailable',
      snapshot: null,
      error: null,
    })
  },
)
it('сообщает о повреждении настоящего JSON manifest', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response('{', { headers: { 'Content-Type': 'application/json' } }),
      ),
  )
  await checkTsmUpdate()
  expect(useTsmStore.getState()).toMatchObject({
    status: 'error',
    error: 'Файл списка рынков TSM повреждён.',
  })
})

it('проверяет manifest, контрольную сумму, выбранный рынок и использует кэш при неизменном содержимом', async () => {
  const data = fixture()
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(data.manifest))
    .mockResolvedValueOnce(new Response(data.raw))
    .mockResolvedValueOnce(jsonResponse(data.manifest))
  vi.stubGlobal('fetch', fetcher)
  await checkTsmUpdate()
  expect(useTsmStore.getState()).toMatchObject({
    status: 'ready',
    snapshot: data.snapshot,
  })
  expect(readTsmCache(market)).toEqual(data.snapshot)
  await checkTsmUpdate()
  expect(fetcher).toHaveBeenCalledTimes(3)
  expect(fetcher.mock.calls[1]?.[0]).toContain(data.entry.path)
})
it('отклоняет повреждённый JSON, hash и чужой рынок', async () => {
  const data = fixture()
  for (const raw of ['{}', fixture({ ...market, faction: 'horde' }).raw]) {
    const contentId = createHash('sha256').update(raw).digest('hex')
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            ...data.manifest,
            markets: [
              {
                ...data.entry,
                contentId,
                path: `${tsmMarketKey(market)}.${contentId}.json`,
              },
            ],
          }),
        )
        .mockResolvedValueOnce(new Response(raw)),
    )
    await expect(
      loadTsmSnapshot(market, null, new AbortController().signal),
    ).rejects.toThrow()
  }
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(data.manifest))
      .mockResolvedValueOnce(new Response('{}')),
  )
  await expect(
    loadTsmSnapshot(market, null, new AbortController().signal),
  ).rejects.toThrow('контрольная сумма')
})
it('отклоняет несовпадение даты manifest даже при неизменном содержимом кэша', async () => {
  const data = fixture()
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(data.manifest))
      .mockResolvedValueOnce(new Response(data.raw)),
  )
  await checkTsmUpdate()
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ...data.manifest,
          markets: [{ ...data.entry, scannedAt: '2026-01-02T00:00:00Z' }],
        }),
      )
      .mockResolvedValueOnce(new Response(data.raw)),
  )
  await checkTsmUpdate()
  expect(useTsmStore.getState()).toMatchObject({
    status: 'error',
    snapshot: data.snapshot,
    error: 'Снимок TSM относится к другому рынку или дате.',
  })
})
it('игнорирует повреждённый кэш и сохраняет снимок в памяти при ошибке записи', async () => {
  const data = fixture()
  const key = `craftcalc-tsm-v1-${tsmMarketKey(market)}`
  for (const raw of [
    '{',
    JSON.stringify({ snapshot: data.snapshot }),
    JSON.stringify({
      snapshot: fixture({ ...market, faction: 'horde' }).snapshot,
      contentId: data.entry.contentId,
    }),
  ]) {
    localStorage.setItem(key, raw)
    expect(readTsmCache(market)).toBeNull()
  }
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError')
  })
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(data.manifest))
      .mockResolvedValueOnce(new Response(data.raw)),
  )
  await checkTsmUpdate()
  expect(useTsmStore.getState()).toMatchObject({
    status: 'ready',
    snapshot: data.snapshot,
    cacheError: 'Не удалось сохранить кэш TSM. Снимок доступен в текущей вкладке.',
  })
})
it('сохраняет успешный снимок при сетевой ошибке, различает отсутствие опубликованных данных', async () => {
  const data = fixture()
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(data.manifest))
      .mockResolvedValueOnce(new Response(data.raw)),
  )
  await checkTsmUpdate()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  await checkTsmUpdate()
  expect(useTsmStore.getState()).toMatchObject({
    status: 'error',
    snapshot: data.snapshot,
    error: 'Не удалось загрузить цены TSM. Проверьте соединение и повторите попытку.',
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse({ ...data.manifest, markets: [] })),
  )
  await checkTsmUpdate()
  expect(useTsmStore.getState().status).toBe('unavailable')
})
it.each(['market', 'version', 'revision'] as const)(
  'игнорирует старый ответ после смены %s',
  async (change) => {
    let resolve: (value: Response) => void = () => {
      throw new Error('Не создан запрос')
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((done) => {
            resolve = done
          }),
      ),
    )
    const request = checkTsmUpdate()
    const store = useCraftStore.getState()
    if (change === 'market')
      store.setTbcPricing({
        ...store.tbcPricing,
        market: { ...market, faction: 'horde' },
      })
    else {
      store.setActiveVersion('classic')
      if (change === 'revision') store.setActiveVersion('tbc')
    }
    resolve(
      jsonResponse({
        schemaVersion: 1,
        generatedAt: '2026-01-01T00:00:00Z',
        markets: [],
      }),
    )
    await request
    expect(useTsmStore.getState().loadedAt).toBeNull()
  },
)
it('не запрашивает цены без рынка, проверяет каждые 15 минут и при возвращении', async () => {
  vi.useFakeTimers()
  const data = fixture()
  const fetcher = vi
    .fn()
    .mockResolvedValue(jsonResponse({ ...data.manifest, markets: [] }))
  vi.stubGlobal('fetch', fetcher)
  const stop = startTsmClient()
  await vi.advanceTimersByTimeAsync(1)
  expect(fetcher).toHaveBeenCalledTimes(1)
  useCraftStore.getState().setTbcPricing({
    ...useCraftStore.getState().tbcPricing,
    metric: 'marketValue',
    priceMode: 'tsm',
  })
  expect(fetcher).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
  await checkTsmUpdate()
  expect(fetcher).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
  expect(fetcher).toHaveBeenCalledTimes(3)
  vi.setSystemTime(Date.now() + TSM_CHECK_INTERVAL)
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(1)
  expect(fetcher).toHaveBeenCalledTimes(4)
  useCraftStore
    .getState()
    .setTbcPricing({ ...useCraftStore.getState().tbcPricing, market: null })
  expect(useTsmStore.getState().snapshot).toBeNull()
  await vi.advanceTimersByTimeAsync(TSM_CHECK_INTERVAL)
  expect(fetcher).toHaveBeenCalledTimes(4)
  stop()
})
