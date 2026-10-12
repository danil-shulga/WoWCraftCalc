import type { RecipeImportData, RecipeImportItem } from '../store/useCraftStore'
import { referenceItemName } from './reference-database-index'
import type {
  ReferenceDatabase,
  ReferenceItem,
  ReferenceRecipe,
} from './reference-database.types'
import type { ItemLanguage } from './user-settings'

export function referenceItemToImport(
  item: ReferenceItem,
  language: ItemLanguage = 'ru',
): RecipeImportItem {
  return {
    wowheadItemId: item.itemId,
    wowheadVersion: 'forever',
    name: referenceItemName(item, language),
    names: item.names,
    iconUrl: item.iconUrl,
    defaultPurchasePriceCopper: item.vendor.baseBuyPriceCopper,
    defaultSalePriceCopper: item.vendor.sellPriceCopper,
  }
}

export function referenceRecipeToImport(
  database: ReferenceDatabase,
  recipe: ReferenceRecipe,
  confirmedOutputQuantity: number,
  language: ItemLanguage = 'ru',
): RecipeImportData {
  if (!Number.isSafeInteger(confirmedOutputQuantity) || confirmedOutputQuantity < 1)
    throw new Error('Укажите положительное целое количество предметов за один крафт')
  const product = database.items[String(recipe.productItemId)]
  if (!product) throw new Error('Результат отсутствует в базе')
  return {
    product: referenceItemToImport(product, language),
    reagents: recipe.reagents.map((line) => {
      const item = database.items[String(line.itemId)]
      if (!item) throw new Error('Реагент отсутствует в базе')
      return { ...referenceItemToImport(item, language), quantity: line.quantity }
    }),
    outputQuantity: confirmedOutputQuantity,
    profession: recipe.profession,
  }
}
