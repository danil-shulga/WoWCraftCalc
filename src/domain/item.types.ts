import type { Profession } from './professions'
import type { GameVersion } from './game-version'
import type { CurrencyDisplayMode, ItemLanguage, WowheadVersion } from './user-settings'
import type { PriceSource, TsmSettings } from './tsm'
import type { CraftPlan } from './planner.types'

export type ItemId = string

export type ItemSection = 'crafts' | 'reagents'
export type RootItemSection = ItemSection | 'favorites'
export type RootItemOrder = Partial<Record<RootItemSection, ItemId[] | undefined>>

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
  requiredLevel?: number | null | undefined
  qualityId?: number | null | undefined
  source?:
    | {
        wowheadItemId: number
        wowheadVersion?: WowheadVersion | undefined
      }
    | undefined
  sections: ItemSection[]
  isFavorite?: boolean | undefined
  purchasePriceCopper: number | null
  salePriceCopper: number | null
  purchasePriceSource?: PriceSource | undefined
  salePriceSource?: PriceSource | undefined
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
  expectedItem?: Item | undefined
}

export interface VersionWorkspace {
  planner?: CraftPlan | undefined
  rootItemOrder?: RootItemOrder | undefined
  items: ItemCatalog
  ownedProfessions: Profession[]
}

export interface PersistedCraftData {
  tbcPricing: TsmSettings
  activeVersion: GameVersion
  workspaces: Record<GameVersion, VersionWorkspace>
  currencyDisplay: CurrencyDisplayMode
  itemLanguage: ItemLanguage
}
