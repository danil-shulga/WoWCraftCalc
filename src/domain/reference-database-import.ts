import type { RecipeImportData, RecipeImportItem } from '../store/useCraftStore'
import { referenceItemName } from './reference-database-index'
import type {
  ReferenceDatabase,
  ReferenceItem,
  ReferenceRecipe,
} from './reference-database.types'
import type { ItemLanguage } from './user-settings'
import { GAME_VERSION_REGISTRY } from './game-version'
import type { GameVersion } from './game-version'

export function referenceItemToImport(
  item: ReferenceItem,
  version: GameVersion,
  language: ItemLanguage = 'ru',
): RecipeImportItem {
  return {
    wowheadItemId: item.itemId,
    wowheadVersion: GAME_VERSION_REGISTRY[version].wowheadVersion,
    name: referenceItemName(item, language),
    names: item.names,
    iconUrl: item.iconUrl,
    defaultPurchasePriceCopper: null,
    defaultSalePriceCopper: null,
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
  if (
    database.recipes[String(recipe.spellId)] !== recipe ||
    !GAME_VERSION_REGISTRY[database.gameVersion].professions.includes(recipe.profession)
  )
    throw new Error('Рецепт не принадлежит выбранной базе')
  const product = database.items[String(recipe.productItemId)]
  if (!product) throw new Error('Результат отсутствует в базе')
  return {
    product: referenceItemToImport(product, database.gameVersion, language),
    reagents: recipe.reagents.map((line) => {
      const item = database.items[String(line.itemId)]
      if (!item) throw new Error('Реагент отсутствует в базе')
      return {
        ...referenceItemToImport(item, database.gameVersion, language),
        quantity: line.quantity,
      }
    }),
    outputQuantity: confirmedOutputQuantity,
    profession: recipe.profession,
  }
}
