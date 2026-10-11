import type { Profession } from './professions'
import type { CurrencyDisplayMode, ItemLanguage, WowheadVersion } from './user-settings'

export type ItemId = string

export type ItemSection = 'crafts' | 'reagents'

export type AcquisitionMethod = 'auto' | 'buy' | 'craft'

export type ItemPriceField = 'purchasePriceCopper' | 'salePriceCopper'

export interface RecipeLine {
  itemId: ItemId
  quantity: number
  acquisition: AcquisitionMethod
}

export interface Recipe {
  outputQuantity: number
  profession: Profession | null
  reagents: RecipeLine[]
}

export interface Item {
  id: ItemId
  name: string
  // Optional only for legacy callers; store writes and persistence always normalize it.
  names?: ItemNames | undefined
  iconUrl: string
  source?:
    | {
        wowheadItemId: number
        wowheadVersion?: WowheadVersion | undefined
      }
    | undefined
  sections: ItemSection[]
  purchasePriceCopper: number | null
  salePriceCopper: number | null
  recipe: Recipe | null
}

export type ItemCatalog = Record<ItemId, Item>

export interface ItemNames {
  ru: string | null
  en: string | null
}

export interface ItemNamesUpdate {
  itemId: ItemId
  wowheadItemId: number
  wowheadVersion: WowheadVersion
  names: ItemNames
}

export interface PersistedCraftData {
  items: ItemCatalog
  ownedProfessions: Profession[]
  currencyDisplay: CurrencyDisplayMode
  itemLanguage?: ItemLanguage | undefined
}
