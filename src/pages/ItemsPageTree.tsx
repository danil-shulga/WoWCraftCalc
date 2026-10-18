import { memo } from 'react'
import type { ComponentProps, MouseEventHandler, PointerEvent } from 'react'
import { ItemTree } from '../components/item-tree/ItemTree/ItemTree'
import { getItemRecipe } from '../domain/essence-conversion'
import { getItemName } from '../domain/item-names'
import type { CatalogDisenchantCalculation } from '../domain/disenchanting-catalog'
import type { Item, ItemId, ItemPriceField } from '../domain/item.types'
import { describeDisenchantEstimate } from '../features/disenchanting/disenchanting-presentation'
import { DisenchantEstimateDetails } from '../features/disenchanting/DisenchantEstimateDetails'

type TreeProps = ComponentProps<typeof ItemTree>

interface ItemsPageTreeProps extends Pick<
  TreeProps,
  | 'catalog'
  | 'calculationSnapshot'
  | 'itemLanguage'
  | 'showPurchasePrice'
  | 'expandedPaths'
  | 'onEditItem'
  | 'onDeleteItem'
  | 'onToggleFavorite'
  | 'onSetAcquisition'
> {
  item: Item
  disenchant: CatalogDisenchantCalculation | undefined
  removing: boolean
  dragging: boolean
  plannerQuantity: number | undefined
  isEditingPrices: boolean
  priceField: ItemPriceField
  priceDraft: number | null
  onRemoved: (itemId: ItemId) => void
  onToggleExpanded: (rootItemId: ItemId, path: string) => void
  onSetPlannerQuantity: (itemId: ItemId, quantity: number) => void
  onRemovePlannerTarget: (itemId: ItemId) => void
  onChangePriceDraft: (itemId: ItemId, value: number | null) => void
  onStartPointerDrag: (itemId: ItemId, event: PointerEvent<HTMLElement>) => void
  onSuppressDragClick: MouseEventHandler<HTMLElement>
  onMoveRelative: (itemId: ItemId, position: 'before' | 'after') => void
}

// Keep page-specific controls behind the memo boundary. Unchanged roots receive
// the same expansion set and scalar state, including when another root opens.
export const ItemsPageTree = memo(function ItemsPageTree({
  item,
  catalog,
  calculationSnapshot,
  itemLanguage,
  showPurchasePrice = true,
  expandedPaths,
  disenchant,
  removing,
  dragging,
  plannerQuantity,
  isEditingPrices,
  priceField,
  priceDraft,
  onRemoved,
  onToggleExpanded,
  onSetPlannerQuantity,
  onRemovePlannerTarget,
  onChangePriceDraft,
  onStartPointerDrag,
  onSuppressDragClick,
  onMoveRelative,
  onEditItem,
  onDeleteItem,
  onToggleFavorite,
  onSetAcquisition,
}: ItemsPageTreeProps) {
  const recipe = getItemRecipe(catalog, item.id)
  return (
    <ItemTree
      rootItemId={item.id}
      catalog={catalog}
      calculationSnapshot={calculationSnapshot}
      itemLanguage={itemLanguage}
      showPurchasePrice={showPurchasePrice}
      expandedPaths={expandedPaths}
      onToggleExpanded={(path) => {
        onToggleExpanded(item.id, path)
      }}
      onEditItem={onEditItem}
      onDeleteItem={onDeleteItem}
      onToggleFavorite={onToggleFavorite}
      onSetAcquisition={onSetAcquisition}
      presence={{
        removing,
        onRemoved: () => {
          onRemoved(item.id)
        },
      }}
      valuation={
        disenchant
          ? {
              label: 'Распыление',
              value: disenchant.result.expectedValueCopper,
              profitLabel: 'Прибыль за распыление',
              profit: disenchant.configuredProfit,
              allProfessionsProfit: disenchant.allProfessionsProfit,
              boughtReagentsProfit: disenchant.boughtReagentsProfit,
              buyProfit: disenchant.buyProfit,
              description: describeDisenchantEstimate(disenchant, recipe !== null),
              tooltip: (
                <DisenchantEstimateDetails
                  calculation={disenchant}
                  hasRecipe={recipe !== null}
                />
              ),
            }
          : undefined
      }
      planner={{
        itemName: getItemName(item, itemLanguage),
        quantity: plannerQuantity,
        step: recipe?.outputQuantity ?? 1,
        onChange: (quantity) => {
          onSetPlannerQuantity(item.id, quantity)
        },
        onRemove: () => {
          onRemovePlannerTarget(item.id)
        },
      }}
      rootDragAndDrop={{
        draggable: false,
        className: `root-item-row--draggable${dragging ? ' root-item-row--dragging' : ''}`,
        onPointerDown: (event) => {
          onStartPointerDrag(item.id, event)
        },
        onClickCapture: onSuppressDragClick,
        onDragStart: (event) => {
          event.preventDefault()
        },
        onKeyDown: (event) => {
          if (
            event.target !== event.currentTarget ||
            !event.altKey ||
            (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
          )
            return
          event.preventDefault()
          onMoveRelative(item.id, event.key === 'ArrowUp' ? 'before' : 'after')
        },
      }}
      {...(isEditingPrices
        ? {
            quickPriceEdit: {
              field: priceField,
              value: priceDraft,
              onChange: (value: number | null) => {
                onChangePriceDraft(item.id, value)
              },
            },
          }
        : {})}
    />
  )
})
