import type { ItemCatalog, ItemId, Recipe } from './item.types'

// Only known pairs are eligible; names and local IDs are not game identities.
const essencePairs = [
  [10938, 10939],
  [10998, 11082],
  [11134, 11135],
  [11174, 11175],
  [16202, 16203],
  [22447, 22446],
] as const

export function getEssenceConversion(
  catalog: ItemCatalog,
  itemId: ItemId,
): Recipe | null {
  const item = catalog[itemId]
  if (!item?.source || item.recipe !== null) return null
  const source = item.source
  const pair = essencePairs.find(
    ([small, large]) => small === source.wowheadItemId || large === source.wowheadItemId,
  )
  if (!pair) return null
  const [small, large] = pair
  if (
    small === 22447 &&
    source.wowheadVersion !== undefined &&
    source.wowheadVersion !== 'tbc'
  )
    return null
  const isSmall = source.wowheadItemId === small
  const matching = (id: number) =>
    Object.values(catalog).filter(
      (candidate) =>
        candidate.source?.wowheadItemId === id &&
        (candidate.source.wowheadVersion === undefined ||
          source.wowheadVersion === undefined ||
          candidate.source.wowheadVersion === source.wowheadVersion),
    )
  const inputs = matching(isSmall ? large : small)
  // Duplicate game IDs are ambiguous. Do not silently choose a price or an item.
  if (matching(source.wowheadItemId).length !== 1 || inputs.length !== 1) return null
  const input = inputs[0]
  if (!input) return null
  return {
    outputQuantity: isSmall ? 3 : 1,
    profession: null,
    reagents: [{ itemId: input.id, quantity: isSmall ? 1 : 3, acquisition: 'buy' }],
  }
}

export function getItemRecipe(catalog: ItemCatalog, itemId: ItemId): Recipe | null {
  // Преобразования не сохраняются в каталоге. Их единственный реагент всегда
  // покупается, даже в сценарии всех профессий: обратный шаг запрещён.
  return catalog[itemId]?.recipe ?? getEssenceConversion(catalog, itemId)
}
