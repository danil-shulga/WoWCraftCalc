import { z } from 'zod'
import realms from './tsm-markets.json'
import type { GameVersion } from './game-version'
import type { Item, ItemPriceField } from './item.types'

export const TSM_REALMS = realms
export const TSM_METRIC_LABELS = {
  recent: 'Текущая оценка',
  marketValue: 'Рыночная цена',
} as const
export type TsmMetric = keyof typeof TSM_METRIC_LABELS
export type PriceSource = 'manual' | 'tsm'
export type PriceMode = 'individual' | 'tsm'
export const tsmMarketSchema = z
  .object({
    region: z.enum(['eu', 'us']),
    realm: z.string(),
    faction: z.enum(['alliance', 'horde']),
  })
  .refine(
    (market) =>
      realms.some(
        (realm) => realm.region === market.region && realm.realm === market.realm,
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
export const DEFAULT_TSM_SETTINGS: TsmSettings = {
  market: null,
  metric: 'recent',
  priceMode: 'individual',
}
export function tsmMarketKey(market: TsmMarket): string {
  return `tbc-${market.region}-${market.realm}-${market.faction}`
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
    path: z.string().regex(/^tbc-[a-z0-9-]+\.[a-f0-9]{64}\.json$/),
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
export type TsmManifest = z.output<typeof tsmManifestSchema>

export interface PriceContext {
  version: GameVersion
  settings: TsmSettings
  snapshot: TsmSnapshot | null
}
export function canUseTsm(item: Pick<Item, 'source'>, version: GameVersion): boolean {
  return (
    version === 'tbc' &&
    item.source !== undefined &&
    (item.source.wowheadVersion === undefined || item.source.wowheadVersion === 'tbc')
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
  if (usesTsmPrice(item, field, context) && context) return getTsmPrice(item, context)
  return item[field]
}

export function usesTsmPrice(
  item: Item,
  field: ItemPriceField,
  context?: PriceContext,
): boolean {
  const source =
    field === 'purchasePriceCopper' ? item.purchasePriceSource : item.salePriceSource
  return (
    context?.version === 'tbc' &&
    (context.settings.priceMode === 'tsm' || source === 'tsm')
  )
}
