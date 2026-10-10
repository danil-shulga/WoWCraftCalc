import type { Profession } from './professions'

export type ItemId = string

export type ItemSection = 'crafts' | 'reagents'

export type AcquisitionMethod = 'buy' | 'craft'

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
  iconUrl: string
  sections: ItemSection[]
  purchasePriceCopper: number | null
  salePriceCopper: number | null
  recipe: Recipe | null
}

export type ItemCatalog = Record<ItemId, Item>

export interface PersistedCraftData {
  items: ItemCatalog
}
