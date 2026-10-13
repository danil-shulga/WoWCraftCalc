import { estimateStorageBytes, formatStorageUsage } from './storage-usage'

afterEach(() => {
  localStorage.clear()
})

it('считает ключи и значения всех записей, включая Unicode и кэш', () => {
  localStorage.clear()
  expect(estimateStorageBytes(localStorage)).toBe(0)
  localStorage.setItem('catalog', 'Я😀')
  localStorage.setItem('tsm', '123')
  expect(estimateStorageBytes(localStorage)).toBe(32)
})

it('показывает оценку остатка и ограничивает её нулём', () => {
  expect(formatStorageUsage(0)).toBe('localStorage:\nзанято ≈ 0 МБ\nосталось ≈ 5,24 МБ')
  expect(formatStorageUsage(10_000)).toContain('занято ≈ 0,01 МБ')
  expect(formatStorageUsage(796_700)).toContain('занято ≈ 0,8 МБ')
  expect(formatStorageUsage(1_000_000)).toContain('занято ≈ 1 МБ')
  expect(formatStorageUsage(6 * 1024 * 1024)).toBe(
    'localStorage:\nзанято ≈ 6,29 МБ\nосталось ≈ 0 МБ',
  )
  expect(formatStorageUsage(null)).toBe('localStorage недоступен')
})
