import { useMemo } from 'react'
import { calculateCraftPlan } from '../../domain/planner'
import {
  selectActiveItems,
  selectActiveProfessions,
  selectPlannerTargets,
} from '../../store/craft.selectors'
import { useCraftStore } from '../../store/useCraftStore'
import { usePriceContext } from '../tsm/tsm-client'

export function usePlanner() {
  const catalog = useCraftStore(selectActiveItems)
  const targets = useCraftStore(selectPlannerTargets)
  const professions = useCraftStore(selectActiveProfessions)
  const prices = usePriceContext()
  return useMemo(
    () => calculateCraftPlan(catalog, targets, new Set(professions), prices),
    [catalog, targets, professions, prices],
  )
}
