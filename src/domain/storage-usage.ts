const ESTIMATED_LOCAL_STORAGE_LIMIT = 5 * 1024 * 1024

const sizeFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

export function estimateStorageBytes(storage: Storage): number {
  let bytes = 0
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key !== null) {
      // Keys and values are UTF-16 strings, including surrogate pairs.
      bytes += (key.length + (storage.getItem(key)?.length ?? 0)) * 2
    }
  }
  return bytes
}

function formatMegabytes(bytes: number): string {
  return `${sizeFormatter.format(bytes / 1_000_000)} МБ`
}

export function formatStorageUsage(bytes: number | null): string {
  if (bytes === null) return 'localStorage недоступен'
  const remaining = Math.max(0, ESTIMATED_LOCAL_STORAGE_LIMIT - bytes)
  return `localStorage:\nзанято ≈ ${formatMegabytes(bytes)}\nосталось ≈ ${formatMegabytes(remaining)}`
}
