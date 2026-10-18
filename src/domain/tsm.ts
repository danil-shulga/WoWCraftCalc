import { z } from 'zod'
import realms from './tsm-markets.json'
import type { GameVersion } from './game-version'
import type { Item, ItemPriceField } from './item.types'

export const TSM_REALMS = realms
export function supportsTsm(version: GameVersion): version is 'tbc' | 'classic' {
  return version === 'tbc' || version === 'classic'
}
export const TSM_METRIC_LABELS = {
  recent: 'Текущая оценка',
  marketValue: 'Рыночная цена',
} as const
export type PriceSource = 'manual' | 'tsm'
export const tsmMarketSchema = z
  .object({
    // Missing version identifies existing TBC settings and published snapshots.
    version: z.enum(['tbc', 'classic']).optional(),
    region: z.enum(['eu', 'us']),
    realm: z.string(),
    faction: z.enum(['alliance', 'horde']),
  })
  .refine(
    (market) =>
      realms.some(
        (realm) =>
          realm.version === (market.version ?? 'tbc') &&
          realm.region === market.region &&
          realm.realm === market.realm,
      ),
    'Неподдерживаемый рынок TSM',
  )
export type TsmMarket = z.output<typeof tsmMarketSchema>
export const tsmSettingsSchema = z.object({
  market: tsmMarketSchema.nullable().default(null),
  metric: z.enum(['recent', 'marketValue']).default('recent'),
  priceMode: z.enum(['individual', 'tsm']).default('individual'),
})
export type TsmSettings = z.output<typeof tsmSettingsSchema>
export function tsmSettingsSchemaFor(version: 'tbc' | 'classic') {
  return tsmSettingsSchema.refine(
    (settings) => !settings.market || (settings.market.version ?? 'tbc') === version,
    'Рынок TSM относится к другой версии игры',
  )
}
export const DEFAULT_TSM_SETTINGS: TsmSettings = {
  market: null,
  metric: 'recent',
  priceMode: 'individual',
}
export function tsmMarketKey(market: TsmMarket): string {
  return `${market.version ?? 'tbc'}-${market.region}-${market.realm}-${market.faction}`
}
const timestamp = z.iso.datetime()
const tsmPrice = z.number().int().positive().nullable()
export const tsmSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  market: tsmMarketSchema,
  scannedAt: timestamp,
  items: z
    .record(
      z
        .string()
        .regex(/^[1-9]\d*$/)
        .refine((value) => Number.isSafeInteger(Number(value))),
      z.object({ recent: tsmPrice, marketValue: tsmPrice }),
    )
    .refine((items) => Object.keys(items).length > 0),
})
export type TsmSnapshot = z.output<typeof tsmSnapshotSchema>
export const tsmManifestEntrySchema = z
  .object({
    market: tsmMarketSchema,
    scannedAt: timestamp,
    contentId: z.string().regex(/^[a-f0-9]{64}$/),
    path: z.string().regex(/^(?:tbc|classic)-[a-z0-9-]+\.[a-f0-9]{64}\.json$/),
  })
  .refine(
    (entry) => entry.path === `${tsmMarketKey(entry.market)}.${entry.contentId}.json`,
  )
export const tsmManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: timestamp,
    markets: z.array(tsmManifestEntrySchema),
  })
  .refine(
    (manifest) =>
      new Set(manifest.markets.map((entry) => tsmMarketKey(entry.market))).size ===
      manifest.markets.length,
  )

export interface PriceContext {
  version: GameVersion
  settings: TsmSettings
  snapshot: TsmSnapshot | null
}
export function canUseTsm(item: Pick<Item, 'source'>, version: GameVersion): boolean {
  return (
    supportsTsm(version) &&
    item.source !== undefined &&
    (item.source.wowheadVersion === undefined || item.source.wowheadVersion === version)
  )
}
export function getTsmPrice(
  item: Pick<Item, 'source'>,
  context: PriceContext,
): number | null {
  const { settings, snapshot } = context
  if (
    !canUseTsm(item, context.version) ||
    !settings.market ||
    (settings.market.version ?? 'tbc') !== context.version ||
    !snapshot ||
    tsmMarketKey(settings.market) !== tsmMarketKey(snapshot.market)
  )
    return null
  return snapshot.items[String(item.source?.wowheadItemId)]?.[settings.metric] ?? null
}
export function resolveItemPrice(
  item: Item,
  field: ItemPriceField,
  context?: PriceContext,
): number | null {
  return resolvePrice(item, field, context).value
}

export function usesTsmPrice(
  item: Item,
  field: ItemPriceField,
  context?: PriceContext,
): boolean {
  return resolvePrice(item, field, context).source === 'tsm'
}

function resolvePrice(
  item: Item,
  field: ItemPriceField,
  context?: PriceContext,
): { value: number | null; source: PriceSource | null } {
  const manual = item[field]
  if (!context || !supportsTsm(context.version)) {
    return { value: manual, source: manual === null ? null : 'manual' }
  }
  const source =
    field === 'purchasePriceCopper' ? item.purchasePriceSource : item.salePriceSource
  const tsm = getTsmPrice(item, context)
  const preferTsm = context.settings.priceMode === 'tsm' || source === 'tsm'
  if (tsm !== null && (preferTsm || manual === null)) {
    return { value: tsm, source: 'tsm' }
  }
  return { value: manual, source: manual === null ? null : 'manual' }
}
