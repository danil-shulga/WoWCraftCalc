import { act, cleanup, renderHook } from '@testing-library/react'
import { useLocalStorageUsage } from './useLocalStorageUsage'
import { notifyLocalStorageChanged } from '../store/local-storage-events'

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

it('обновляет объём после уведомления о записи и удалении в своей вкладке', () => {
  const { result, unmount } = renderHook(useLocalStorageUsage)
  expect(result.current).toBe(0)
  localStorage.setItem('key', 'value')
  act(notifyLocalStorageChanged)
  expect(result.current).toBe(16)
  localStorage.clear()
  act(notifyLocalStorageChanged)
  expect(result.current).toBe(0)
  unmount()
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

it('не обходит 100 ключей повторно за минуту простоя', () => {
  for (let index = 0; index < 100; index++)
    localStorage.setItem(`key-${String(index)}`, 'value')
  renderHook(useLocalStorageUsage)
  const key = vi.spyOn(Storage.prototype, 'key')
  act(() => {
    vi.advanceTimersByTime(60000)
  })
  expect(key.mock.calls.length).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('читает готовый снимок при 20 перерисовках потребителя', () => {
  for (let index = 0; index < 100; index++)
    localStorage.setItem(`key-${String(index)}`, 'value')
  const view = renderHook(useLocalStorageUsage)
  const key = vi.spyOn(Storage.prototype, 'key')
  for (let index = 0; index < 20; index++) view.rerender()
  expect(key.mock.calls.length).toBe(0)
})

it('делит один обход между потребителями и отписывается после последнего', () => {
  localStorage.setItem('a', 'b')
  const first = renderHook(useLocalStorageUsage)
  const second = renderHook(useLocalStorageUsage)
  const key = vi.spyOn(Storage.prototype, 'key')
  localStorage.setItem('c', 'de')
  act(notifyLocalStorageChanged)
  expect(first.result.current).toBe(10)
  expect(second.result.current).toBe(10)
  expect(key.mock.calls.length).toBe(2)
  first.unmount()
  localStorage.removeItem('a')
  act(notifyLocalStorageChanged)
  expect(second.result.current).toBe(6)
  second.unmount()
  key.mockClear()
  window.dispatchEvent(new Event('focus'))
  window.dispatchEvent(new StorageEvent('storage'))
  notifyLocalStorageChanged()
  expect(key.mock.calls.length).toBe(0)
  localStorage.setItem('c', 'def')
  const mountedAgain = renderHook(useLocalStorageUsage)
  expect(mountedAgain.result.current).toBe(8)
})

it('восстанавливает оценку по фокусу после ошибки чтения', () => {
  localStorage.setItem('a', 'b')
  const { result } = renderHook(useLocalStorageUsage)
  const key = vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
    throw new Error('Ошибка измерения')
  })
  act(notifyLocalStorageChanged)
  expect(result.current).toBeNull()
  key.mockRestore()
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
  expect(result.current).toBe(4)
})
