import { getAutomaticAcquisitionMethod } from './calculations'
import type { ItemCatalog, ItemId } from './item.types'
import type {
  CraftStep,
  PlannerResult,
  PlannerTarget,
  ShoppingLine,
} from './planner.types'
import type { Profession } from './professions'
import { resolveItemPrice, usesTsmPrice, type PriceContext } from './tsm'

export function isPlannerQuantity(quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0
}

function safe(value: number): number {
  if (!Number.isSafeInteger(value))
    throw new Error('Переполнение количества или суммы плана')
  return value
}

/** Validate before asking the catalog calculator to resolve automatic acquisition.
 * The iterative traversal also orders every consumer before its dependencies. */
function dependencyOrder(
  catalog: ItemCatalog,
  targets: readonly PlannerTarget[],
): ItemId[] {
  const state = new Map<ItemId, 'visiting' | 'done'>()
  const finished: ItemId[] = []
  for (const target of targets) {
    const stack = [{ id: target.itemId, exit: false }]
    while (stack.length > 0) {
      const entry = stack.pop()
      if (!entry) break
      if (entry.exit) {
        state.set(entry.id, 'done')
        finished.push(entry.id)
        continue
      }
      if (state.get(entry.id) === 'done') continue
      if (state.has(entry.id)) throw new Error('Циклическая зависимость в плане')
      const item = catalog[entry.id]
      if (!item) throw new Error('Предмет плана или реагент отсутствует в каталоге')
      state.set(entry.id, 'visiting')
      stack.push({ id: entry.id, exit: true })
      if (!item.recipe) continue
      const recipe = item.recipe
      if (!isPlannerQuantity(recipe.outputQuantity) || recipe.reagents.length === 0)
        throw new Error('Некорректный выход или пустой рецепт в плане')
      const ids = new Set<ItemId>()
      for (const line of recipe.reagents) {
        if (
          !isPlannerQuantity(line.quantity) ||
          ids.has(line.itemId) ||
          !['buy', 'craft', 'auto'].includes(line.acquisition)
        )
          throw new Error('Некорректный состав рецепта в плане')
        ids.add(line.itemId)
        stack.push({ id: line.itemId, exit: false })
      }
    }
  }
  return finished.reverse()
}

export function calculateCraftPlan(
  catalog: ItemCatalog,
  targets: readonly PlannerTarget[],
  ownedProfessions: ReadonlySet<Profession> = new Set(),
  prices?: PriceContext,
): PlannerResult {
  const result: PlannerResult = {
    targets: [],
    purchases: [],
    steps: [],
    budget: 0,
    productionBudget: 0,
    additionalBudget: 0,
    revenue: null,
    profit: null,
    knownBudget: 0,
    missingPrices: 0,
    errors: [],
    warnings: [],
  }
  try {
    const seen = new Set<ItemId>()
    for (const target of targets) {
      if (
        !target.itemId ||
        !isPlannerQuantity(target.quantity) ||
        seen.has(target.itemId)
      )
        throw new Error('Некорректная или повторяющаяся цель плана')
      seen.add(target.itemId)
    }
    const order = dependencyOrder(catalog, targets)
    const craft = new Map<ItemId, number>()
    const production = new Map<ItemId, number>()
    const additional = new Map<ItemId, number>()
    const neededFor = new Map<ItemId, Set<ItemId>>()
    const add = (map: Map<ItemId, number>, id: ItemId, quantity: number) => {
      map.set(id, safe((map.get(id) ?? 0) + quantity))
    }
    let revenue: number | null = 0
    let hasProduction = false
    for (const target of targets) {
      const item = catalog[target.itemId]
      if (!item) throw new Error('Цель отсутствует в каталоге')
      const method = item.recipe ? 'craft' : 'buy'
      result.targets.push({ ...target, method })
      add(method === 'craft' ? craft : additional, target.itemId, target.quantity)
      if (method === 'craft') {
        hasProduction = true
        const sale = resolveItemPrice(item, 'salePriceCopper', prices)
        revenue =
          sale === null || revenue === null
            ? null
            : safe(revenue + safe(sale * target.quantity))
      } else {
        result.warnings.push({
          itemId: item.id,
          message: 'Нет рецепта: цель включена в дополнительные покупки',
        })
      }
    }
    const steps: CraftStep[] = []
    for (const id of order) {
      const requiredQuantity = craft.get(id) ?? 0
      if (requiredQuantity === 0) continue
      const item = catalog[id]
      const recipe = item?.recipe
      if (!recipe) throw new Error('Для выбранного крафта отсутствует рецепт')
      const craftCount = safe(Math.ceil(requiredQuantity / recipe.outputQuantity))
      const producedQuantity = safe(craftCount * recipe.outputQuantity)
      steps.push({
        itemId: id,
        requiredQuantity,
        craftCount,
        producedQuantity,
        surplusQuantity: producedQuantity - requiredQuantity,
        neededFor: [...(neededFor.get(id) ?? [])],
      })
      if (recipe.profession && !ownedProfessions.has(recipe.profession))
        result.warnings.push({
          itemId: id,
          message: 'Профессия рецепта не отмечена как доступная',
        })
      for (const line of recipe.reagents) {
        const method =
          line.acquisition === 'auto'
            ? getAutomaticAcquisitionMethod(
                catalog,
                line.itemId,
                ownedProfessions,
                prices,
              )
            : line.acquisition
        add(
          method === 'craft' ? craft : production,
          line.itemId,
          safe(craftCount * line.quantity),
        )
        const parents = neededFor.get(line.itemId) ?? new Set<ItemId>()
        parents.add(id)
        neededFor.set(line.itemId, parents)
      }
    }
    const purchases: ShoppingLine[] = []
    let productionBudget: number | null = 0
    let additionalBudget: number | null = 0
    for (const id of new Set([...production.keys(), ...additional.keys()])) {
      const item = catalog[id]
      if (!item) throw new Error('Предмет покупки отсутствует в каталоге')
      const productionQuantity = production.get(id) ?? 0
      const additionalQuantity = additional.get(id) ?? 0
      const quantity = safe(productionQuantity + additionalQuantity)
      const unitPrice = resolveItemPrice(item, 'purchasePriceCopper', prices)
      const cost = unitPrice === null ? null : safe(quantity * unitPrice)
      productionBudget =
        productionBudget === null || (unitPrice === null && productionQuantity > 0)
          ? null
          : safe(productionBudget + productionQuantity * (unitPrice ?? 0))
      additionalBudget =
        additionalBudget === null || (unitPrice === null && additionalQuantity > 0)
          ? null
          : safe(additionalBudget + additionalQuantity * (unitPrice ?? 0))
      if (cost === null) result.missingPrices += 1
      else result.knownBudget = safe(result.knownBudget + cost)
      purchases.push({
        itemId: id,
        quantity,
        productionQuantity,
        additionalQuantity,
        unitPrice,
        priceSource: usesTsmPrice(item, 'purchasePriceCopper', prices) ? 'tsm' : 'manual',
        cost,
        neededFor: [...(neededFor.get(id) ?? [])],
      })
    }
    result.purchases = purchases
    result.steps = steps.reverse()
    result.productionBudget = productionBudget
    result.additionalBudget = additionalBudget
    result.budget =
      productionBudget === null || additionalBudget === null
        ? null
        : safe(productionBudget + additionalBudget)
    result.revenue = hasProduction ? revenue : null
    result.profit =
      !hasProduction || revenue === null || productionBudget === null
        ? null
        : safe(revenue - productionBudget)
    return result
  } catch (error) {
    return {
      ...result,
      purchases: [],
      steps: [],
      budget: null,
      productionBudget: null,
      additionalBudget: null,
      revenue: null,
      profit: null,
      knownBudget: 0,
      missingPrices: 0,
      errors: [
        error instanceof RangeError
          ? 'Граф рецептов слишком глубокий для расчёта'
          : error instanceof Error
            ? error.message
            : 'Не удалось рассчитать план',
      ],
    }
  }
}
