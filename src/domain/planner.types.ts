import type { ItemId } from './item.types'

export interface PlannerTarget {
  itemId: ItemId
  quantity: number
}

export interface CraftPlan {
  targets: PlannerTarget[]
}

export interface CraftStep {
  itemId: ItemId
  requiredQuantity: number
  craftCount: number
  producedQuantity: number
  surplusQuantity: number
  neededFor: ItemId[]
}

export interface PlannedTarget extends PlannerTarget {
  method: 'craft' | 'buy'
}

export interface ShoppingLine {
  itemId: ItemId
  quantity: number
  productionQuantity: number
  additionalQuantity: number
  unitPrice: number | null
  priceSource: 'manual' | 'tsm'
  cost: number | null
  neededFor: ItemId[]
}

export interface PlannerResult {
  targets: PlannedTarget[]
  purchases: ShoppingLine[]
  steps: CraftStep[]
  budget: number | null
  productionBudget: number | null
  additionalBudget: number | null
  revenue: number | null
  profit: number | null
  knownBudget: number
  missingPrices: number
  errors: string[]
  warnings: { itemId: ItemId; message: string }[]
}
