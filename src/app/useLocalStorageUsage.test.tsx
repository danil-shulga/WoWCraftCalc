import { act, cleanup, renderHook } from '@testing-library/react'
import { useLocalStorageUsage } from './useLocalStorageUsage'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  localStorage.clear()
})

it('обновляет объём после записи и удаления в своей вкладке и очищает таймер', async () => {
  const { result, unmount } = renderHook(useLocalStorageUsage)
  expect(result.current).toBe(0)
  localStorage.setItem('key', 'value')
  await act(() => vi.advanceTimersByTime(2000))
  expect(result.current).toBe(16)
  localStorage.clear()
  await act(() => vi.advanceTimersByTime(2000))
  expect(result.current).toBe(0)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('обновляет объём по событию другой вкладки и при возврате фокуса', async () => {
  const { result } = renderHook(useLocalStorageUsage)
  localStorage.setItem('a', 'b')
  await act(() => window.dispatchEvent(new StorageEvent('storage')))
  expect(result.current).toBe(4)
  localStorage.clear()
  await act(() => window.dispatchEvent(new Event('focus')))
  expect(result.current).toBe(0)
})

it('не ломает интерфейс при запрете доступа к localStorage', () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('Access denied', 'SecurityError')
  })
  const { result } = renderHook(useLocalStorageUsage)
  expect(result.current).toBeNull()
})
