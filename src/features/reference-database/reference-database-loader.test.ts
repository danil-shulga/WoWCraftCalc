import {
  buildReferenceDatabaseIndex,
  searchReferenceItems,
} from '../../domain/reference-database-index'
import { parseReferenceDatabase } from '../../domain/reference-database.schema'
import { useCraftStore } from '../../store/useCraftStore'
import { referenceFixture } from '../../test/reference-fixture'
import { createReferenceDatabaseLoader } from './reference-database-loader'

describe('загрузка справочника', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  it('учитывает подпапку, объединяет запросы, кеширует результат и не меняет store', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(referenceFixture()))
    const before = useCraftStore.getState()
    const saved = localStorage.getItem('craft-calc-data')
    const load = createReferenceDatabaseLoader('/CraftCalc/')
    const first = load()
    expect(load()).toBe(first)
    const result = await first
    expect(await load()).toBe(result)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/CraftCalc/data/forever/craftcalc-db.1.60.1.70338.json',
    )
    expect(useCraftStore.getState()).toBe(before)
    expect(localStorage.getItem('craft-calc-data')).toBe(saved)
  })
  it.each([
    new Response(null, { status: 404 }),
    new Response('{broken'),
    Response.json({ schemaVersion: 2 }),
  ])('разрешает повтор после ошибки', async (response) => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(Response.json(referenceFixture()))
    const load = createReferenceDatabaseLoader('./')
    await expect(load()).rejects.toThrow()
    await expect(load()).resolves.toHaveProperty('database')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('завершает зависший запрос по таймауту и разрешает повтор', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(
        () =>
          new Promise(() => {
            /* Request deliberately never settles. */
          }),
      )
      .mockResolvedValueOnce(Response.json(referenceFixture()))
    const load = createReferenceDatabaseLoader('./', 100)
    const rejected = expect(load()).rejects.toThrow('слишком много времени')
    await vi.advanceTimersByTimeAsync(100)
    await rejected
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    await expect(load()).resolves.toHaveProperty('database')
  })
  it('объясняет сетевую ошибку по-русски и разрешает повтор', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json(referenceFixture()))
    const load = createReferenceDatabaseLoader('./')
    await expect(load()).rejects.toThrow('Проверьте соединение')
    await expect(load()).resolves.toHaveProperty('database')
  })
  it('ищет RU/EN, нормализует ё и разделяет результаты и реагенты по профессии', () => {
    const index = buildReferenceDatabaseIndex(parseReferenceDatabase(referenceFixture()))
    expect(searchReferenceItems(index, 'crafts', 'грез')[0]?.itemId).toBe(1)
    expect(searchReferenceItems(index, 'crafts', 'DREAM')[0]?.itemId).toBe(1)
    expect(searchReferenceItems(index, 'reagents', 'CLOTH', 'tailoring')[0]?.itemId).toBe(
      2,
    )
    expect(searchReferenceItems(index, 'crafts', 'cloth')).toEqual([])
    expect(searchReferenceItems(index, 'reagents', '', 'alchemy')).toEqual([])
  })
})

it('разделяет запросы, кеши и ошибки трёх версий', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const version = (typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
    ).includes('/tbc/')
      ? 'tbc'
      : (typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url
          ).includes('/classic/')
        ? 'classic'
        : 'forever'
    return Promise.resolve(Response.json(referenceFixture(version)))
  })
  const load = createReferenceDatabaseLoader('/CraftCalc/')
  const indexes = await Promise.all([load('forever'), load('tbc'), load('classic')])
  expect(indexes.map((index) => index.database.gameVersion)).toEqual([
    'forever',
    'tbc',
    'classic',
  ])
  expect(await load('tbc')).toBe(indexes[1])
  expect(fetchMock).toHaveBeenCalledTimes(3)
  fetchMock.mockResolvedValue(Response.json(referenceFixture('classic')))
  const bad = createReferenceDatabaseLoader('./')
  await expect(bad('tbc')).rejects.toThrow('версия')
  fetchMock.mockResolvedValue(Response.json(referenceFixture('tbc')))
  await expect(bad('tbc')).resolves.toHaveProperty('database.gameVersion', 'tbc')
  fetchMock.mockRestore()
})
