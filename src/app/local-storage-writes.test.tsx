import { act, cleanup, renderHook } from '@testing-library/react'

import { estimateStorageBytes } from '../domain/storage-usage'
import { pruneTsmCache, writeTsmCache } from '../features/tsm/tsm-loader'
import { useLocalStorageUsage } from './useLocalStorageUsage'
import {
  createCraftStorage,
  createEmptyCraftData,
  STORAGE_KEY,
  STORAGE_VERSION,
} from '../store/persistence'
import { useCraftStore } from '../store/useCraftStore'
import { LOCAL_STORAGE_CHANGED_EVENT } from '../store/local-storage-events'

const notified = vi.fn()
beforeEach(() => {
  useCraftStore.getState().resetData()
  localStorage.clear()
  sessionStorage.clear()
  notified.mockClear()
  window.addEventListener(LOCAL_STORAGE_CHANGED_EVENT, notified)
})
afterEach(() => {
  cleanup()
  window.removeEventListener(LOCAL_STORAGE_CHANGED_EVENT, notified)
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

it('обновляет оценку после обычного сохранения, восстановления и сброса store', () => {
  const { result } = renderHook(useLocalStorageUsage)
  act(() => {
    useCraftStore.getState().setCurrencyDisplay('text')
  })
  expect(result.current).toBeGreaterThan(0)
  expect(result.current).toBe(estimateStorageBytes(localStorage))
  const saved = createEmptyCraftData()
  saved.workspaces.forever.items = {
    cloth: {
      id: 'cloth',
      name: 'Ткань',
      iconUrl: '',
      sections: ['crafts'],
      purchasePriceCopper: 0,
      salePriceCopper: null,
      recipe: null,
    },
  }
  act(() => {
    expect(useCraftStore.getState().replaceData(saved)).toBeNull()
  })
  const restoredBytes = result.current
  expect(restoredBytes).toBe(estimateStorageBytes(localStorage))
  act(() => {
    expect(useCraftStore.getState().resetData()).toBeNull()
  })
  expect(result.current).toBe(estimateStorageBytes(localStorage))
  expect(result.current).toBeLessThan(restoredBytes ?? 0)
  expect(notified.mock.calls.length).toBe(3)
})

it('обновляет оценку после удаления старого ключа и текущей записи', () => {
  const storage = createCraftStorage()
  storage.setItem(STORAGE_KEY, {
    state: createEmptyCraftData(),
    version: STORAGE_VERSION,
  })
  localStorage.setItem('craft-calc-data', '{broken')
  const { result } = renderHook(useLocalStorageUsage)
  notified.mockClear()
  act(() => {
    void storage.getItem(STORAGE_KEY)
  })
  expect(localStorage.getItem('craft-calc-data')).toBeNull()
  expect(result.current).toBe(estimateStorageBytes(localStorage))
  act(() => {
    storage.removeItem(STORAGE_KEY)
  })
  expect(result.current).toBe(0)
  expect(notified.mock.calls.length).toBe(2)
})

it('не уведомляет при отказе записи, удаления и блокировке повреждённых данных', () => {
  const error = vi.fn()
  const storage = createCraftStorage(error)
  const record = { state: createEmptyCraftData(), version: STORAGE_VERSION }
  storage.setItem(STORAGE_KEY, record)
  const { result } = renderHook(useLocalStorageUsage)
  const before = result.current
  notified.mockClear()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Переполнено')
  })
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('Запрещено')
  })
  act(() => {
    storage.setItem(STORAGE_KEY, record)
  })
  expect(error).toHaveBeenCalledTimes(1)
  const apply = vi.fn()
  expect(() => {
    storage.replaceData(STORAGE_KEY, record.state, STORAGE_VERSION, apply)
  }).toThrow('Переполнено')
  expect(apply).not.toHaveBeenCalled()
  expect(() => storage.removeItem(STORAGE_KEY)).toThrow('Запрещено')
  storage.blockWrites()
  act(() => {
    storage.setItem(STORAGE_KEY, record)
    storage.removeItem(STORAGE_KEY)
  })
  expect(result.current).toBe(before)
  expect(notified.mock.calls.length).toBe(0)
})

it('ошибка измерения не превращает успешную запись в ошибку сохранения', () => {
  const error = vi.fn()
  const success = vi.fn()
  const storage = createCraftStorage(error, success)
  const { result } = renderHook(useLocalStorageUsage)
  vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
    throw new Error('Ошибка измерения')
  })
  act(() => {
    storage.setItem(STORAGE_KEY, {
      state: createEmptyCraftData(),
      version: STORAGE_VERSION,
    })
  })
  expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  expect(error).not.toHaveBeenCalled()
  expect(success).toHaveBeenCalledTimes(1)
  expect(result.current).toBeNull()
})

it.each([false, true])(
  'очистка старого TSM-кэша уведомляет один раз, частичный отказ: %s',
  (fail) => {
    localStorage.setItem('unrelated', 'keep')
    localStorage.setItem('craftcalc-tsm-v1-first', 'old')
    localStorage.setItem('craftcalc-tsm-v1-last', 'old')
    const { result } = renderHook(useLocalStorageUsage)
    if (fail) {
      const remove = localStorage.removeItem.bind(localStorage)
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
        if (key === 'craftcalc-tsm-v1-first') throw new Error('Отказ удаления')
        remove(key)
      })
    }
    act(() => {
      expect(pruneTsmCache(null)).toBe(
        fail ? 'Не удалось удалить прежний кэш TSM.' : null,
      )
    })
    expect(notified.mock.calls.length).toBe(1)
    expect(result.current).toBe(estimateStorageBytes(localStorage))
    expect(localStorage.getItem('unrelated')).toBe('keep')
    expect(localStorage.getItem('craftcalc-tsm-v1-last')).toBeNull()
  },
)

it('запись и очистка sessionStorage не меняют оценку localStorage', () => {
  localStorage.setItem('a', 'b')
  sessionStorage.setItem('craftcalc-tsm-v1-other', 'old')
  const { result } = renderHook(useLocalStorageUsage)
  act(() => {
    expect(
      writeTsmCache({
        schemaVersion: 1,
        market: { region: 'eu', realm: 'thunderstrike', faction: 'alliance' },
        scannedAt: '2026-01-01T00:00:00Z',
        items: {},
      }),
    ).toBeNull()
  })
  expect(result.current).toBe(4)
  act(() => {
    expect(pruneTsmCache(null)).toBeNull()
  })
  expect(sessionStorage.length).toBe(0)
  expect(result.current).toBe(4)
  expect(notified.mock.calls.length).toBe(0)
})
