import { tsmManifestSchema, tsmMarketKey, tsmSnapshotSchema } from '../../domain/tsm'
import type { TsmMarket, TsmSnapshot } from '../../domain/tsm'
import { z } from 'zod'

const CACHE_PREFIX = 'craftcalc-tsm-v1-'
const contentIds = new WeakMap<TsmSnapshot, string>()
const cacheSchema = z.object({
  snapshot: tsmSnapshotSchema,
  contentId: z.string().regex(/^[a-f0-9]{64}$/),
})
export function readTsmCache(market: TsmMarket): TsmSnapshot | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${tsmMarketKey(market)}`)
    const parsed = cacheSchema.safeParse(raw ? (JSON.parse(raw) as unknown) : null)
    if (
      !parsed.success ||
      tsmMarketKey(parsed.data.snapshot.market) !== tsmMarketKey(market) ||
      Date.parse(parsed.data.snapshot.scannedAt) > Date.now()
    )
      return null
    contentIds.set(parsed.data.snapshot, parsed.data.contentId)
    return parsed.data.snapshot
  } catch {
    return null
  }
}
export function writeTsmCache(snapshot: TsmSnapshot): string | null {
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}${tsmMarketKey(snapshot.market)}`,
      JSON.stringify({ snapshot, contentId: contentIds.get(snapshot) }),
    )
    return null
  } catch {
    return 'Не удалось сохранить кэш TSM. Снимок доступен в текущей вкладке.'
  }
}

async function fetchFile(
  url: string,
  signal: AbortSignal,
  allowMissing = false,
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, { signal, cache: 'no-store' })
  } catch {
    throw new Error(
      'Не удалось загрузить цены TSM. Проверьте соединение и повторите попытку.',
    )
  }
  if (!response.ok && !(allowMissing && response.status === 404))
    throw new Error(`Не удалось загрузить цены TSM (HTTP ${String(response.status)}).`)
  return response
}
export async function loadTsmSnapshot(
  market: TsmMarket,
  previous: TsmSnapshot | null,
  signal: AbortSignal,
  baseUrl = import.meta.env.BASE_URL,
): Promise<TsmSnapshot | null> {
  const manifestResponse = await fetchFile(
    `${baseUrl}data/tsm/manifest.json`,
    signal,
    true,
  )
  if (
    manifestResponse.status === 404 ||
    manifestResponse.headers.get('content-type')?.toLowerCase().includes('text/html')
  )
    return null
  const manifest = await manifestResponse
    .json()
    .then((value: unknown) => tsmManifestSchema.safeParse(value))
    .catch(() => null)
  if (!manifest?.success) throw new Error('Файл списка рынков TSM повреждён.')
  const entry = manifest.data.markets.find(
    (value) => tsmMarketKey(value.market) === tsmMarketKey(market),
  )
  if (!entry) return null
  if (
    previous &&
    tsmMarketKey(previous.market) === tsmMarketKey(market) &&
    previous.scannedAt === entry.scannedAt &&
    contentIds.get(previous) === entry.contentId
  )
    return previous
  const response = await fetchFile(`${baseUrl}data/tsm/${entry.path}`, signal)
  const raw = await response.text()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const contentId = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')
  if (contentId !== entry.contentId)
    throw new Error('Снимок TSM повреждён: контрольная сумма не совпадает.')
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    throw new Error('Снимок цен TSM содержит некорректный JSON.')
  }
  const parsed = tsmSnapshotSchema.safeParse(value)
  if (!parsed.success) throw new Error('Формат снимка цен TSM повреждён.')
  const snapshot = parsed.data
  if (
    tsmMarketKey(snapshot.market) !== tsmMarketKey(market) ||
    snapshot.scannedAt !== entry.scannedAt
  )
    throw new Error('Снимок TSM относится к другому рынку или дате.')
  if (Date.parse(snapshot.scannedAt) > Date.now())
    throw new Error('Дата снимка TSM находится в будущем.')
  contentIds.set(snapshot, contentId)
  return previous && Date.parse(previous.scannedAt) > Date.parse(snapshot.scannedAt)
    ? previous
    : snapshot
}
