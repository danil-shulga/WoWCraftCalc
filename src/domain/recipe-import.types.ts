import type { Item, ItemNames, ItemSection } from './item.types'
import type { Profession } from './professions'
import type { WowheadVersion } from './user-settings'

export type ItemMetadata = Pick<
  Item,
  'requiredLevel' | 'qualityId' | 'itemLevel' | 'classId' | 'subclassId' | 'inventoryType'
>

export interface RecipeImportItem extends ItemMetadata {
  wowheadItemId: number
  name: string
  names?: ItemNames | undefined
  wowheadVersion?: WowheadVersion | undefined
  iconUrl: string
  defaultPurchasePriceCopper?: number | null | undefined
  defaultSalePriceCopper?: number | null | undefined
}

export interface RecipeImportData {
  product: RecipeImportItem
  reagents: (RecipeImportItem & { quantity: number })[]
  outputQuantity: number
  profession: Profession | null
  productSection?: ItemSection | undefined
}

export type ReferenceImportEntry =
  { kind: 'item'; item: RecipeImportItem } | { kind: 'recipe'; data: RecipeImportData }
