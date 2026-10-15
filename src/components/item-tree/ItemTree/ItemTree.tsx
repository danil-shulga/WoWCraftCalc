import { useState } from 'react'
import type { HTMLAttributes } from 'react'
import type { CatalogCalculationSnapshot } from '../../../domain/calculations'
import type { ItemLanguage } from '../../../domain/user-settings'
import type {
  AcquisitionMethod,
  ItemCatalog,
  ItemId,
  ItemPriceField,
  RecipeLine,
} from '../../../domain/item.types'
import { ReagentItemRow } from '../ReagentItemRow/ReagentItemRow'
import { RootItemRow } from '../RootItemRow/RootItemRow'
import './ItemTree.css'

interface QuickPriceEdit {
  field: ItemPriceField
  value: number | null
  onChange: (value: number | null) => void
}

interface ItemTreeProps {
  rootDragAndDrop?: HTMLAttributes<HTMLElement> | undefined
  showPurchasePrice?: boolean
  rootItemId: ItemId
  itemLanguage: ItemLanguage
  catalog: ItemCatalog
  calculationSnapshot: CatalogCalculationSnapshot
  quickPriceEdit?: QuickPriceEdit
  expandedPaths: ReadonlySet<string>
  onToggleExpanded: (path: string) => void
  onEditItem: (itemId: ItemId) => void
  onDeleteItem: (itemId: ItemId) => void
  onToggleFavorite?: ((itemId: ItemId) => void) | undefined
  onSetAcquisition: (
    ownerItemId: ItemId,
    reagentItemId: ItemId,
    acquisition: AcquisitionMethod,
  ) => void
}

interface ItemTreeNodeProps extends ItemTreeProps {
  itemId: ItemId
  path: string
  parentItemId: ItemId | null
  recipeLine: RecipeLine | null
  visited: ReadonlySet<ItemId>
}

function ItemTreeNode({
  rootDragAndDrop,
  showPurchasePrice = true,
  itemId,
  itemLanguage,
  path,
  parentItemId,
  recipeLine,
  catalog,
  calculationSnapshot,
  quickPriceEdit,
  expandedPaths,
  onToggleExpanded,
  onEditItem,
  onDeleteItem,
  onToggleFavorite,
  onSetAcquisition,
  visited,
  rootItemId,
}: ItemTreeNodeProps) {
  const isExpanded = expandedPaths.has(path)
  const [isBranchMounted, setIsBranchMounted] = useState(isExpanded)
  const [wasExpanded, setWasExpanded] = useState(isExpanded)
  const [isOpening, setIsOpening] = useState(isExpanded)

  if (wasExpanded !== isExpanded) {
    setWasExpanded(isExpanded)
    setIsOpening(isExpanded)
  }

  if (isExpanded && !isBranchMounted) {
    setIsBranchMounted(true)
  }

  const item = catalog[itemId]
  const calculation = calculationSnapshot[itemId]

  if (item === undefined || calculation === undefined) {
    return null
  }

  const hasRecipe = item.recipe !== null
  const hasCycle = visited.has(itemId)
  const exactSelectedProfit =
    recipeLine === null
      ? null
      : calculation.exactSelectedUnitProfits[recipeLine.acquisition]
  const nextVisited = new Set(visited)
  nextVisited.add(itemId)

  return (
    <li className="item-tree__node">
      {recipeLine === null ? (
        <RootItemRow
          dragAndDrop={rootDragAndDrop}
          showPurchasePrice={showPurchasePrice}
          purchasePrice={calculation.purchasePrice}
          salePrice={calculation.salePrice}
          purchaseIsTsm={calculation.purchaseIsTsm}
          saleIsTsm={calculation.saleIsTsm}
          item={item}
          itemLanguage={itemLanguage}
          isExpanded={isExpanded}
          hasCycle={hasCycle}
          craftUnitCost={calculation.craftUnitCost}
          configuredProfit={calculation.configuredProfit}
          allProfessionsProfit={calculation.allProfessionsProfit}
          boughtReagentsProfit={calculation.boughtReagentsProfit}
          {...(quickPriceEdit === undefined ? {} : { quickPriceEdit })}
          onToggleExpanded={() => {
            onToggleExpanded(path)
          }}
          onEditItem={onEditItem}
          onDeleteItem={onDeleteItem}
          onToggleFavorite={onToggleFavorite}
        />
      ) : parentItemId === null ? null : (
        <ReagentItemRow
          purchasePrice={calculation.purchasePrice}
          item={item}
          itemLanguage={itemLanguage}
          parentItemId={parentItemId}
          recipeLine={recipeLine}
          isExpanded={isExpanded}
          hasCycle={hasCycle}
          craftUnitCost={calculation.craftUnitCost}
          exactSelectedProfit={exactSelectedProfit}
          automaticMethod={calculation.automaticMethod}
          onToggleExpanded={() => {
            onToggleExpanded(path)
          }}
          onEditItem={onEditItem}
          onToggleFavorite={onToggleFavorite}
          onSetAcquisition={onSetAcquisition}
        />
      )}

      {isBranchMounted && hasRecipe && !hasCycle ? (
        <div
          className={`item-tree__expansion${!isExpanded ? ' item-tree__expansion--closing' : isOpening ? ' item-tree__expansion--opening' : ''}`}
          aria-hidden={!isExpanded}
          inert={!isExpanded}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) {
              if (isExpanded) setIsOpening(false)
              else setIsBranchMounted(false)
            }
          }}
        >
          <ul className="item-tree item-tree--nested">
            {item.recipe?.reagents.map((line) => (
              <ItemTreeNode
                key={line.itemId}
                rootItemId={rootItemId}
                itemLanguage={itemLanguage}
                itemId={line.itemId}
                path={`${path}/${line.itemId}`}
                parentItemId={itemId}
                recipeLine={line}
                catalog={catalog}
                calculationSnapshot={calculationSnapshot}
                expandedPaths={expandedPaths}
                onToggleExpanded={onToggleExpanded}
                onEditItem={onEditItem}
                onDeleteItem={onDeleteItem}
                onToggleFavorite={onToggleFavorite}
                onSetAcquisition={onSetAcquisition}
                visited={nextVisited}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  )
}

export function ItemTree(props: ItemTreeProps) {
  return (
    <ul className="item-tree">
      <ItemTreeNode
        {...props}
        itemId={props.rootItemId}
        path={props.rootItemId}
        parentItemId={null}
        recipeLine={null}
        visited={new Set()}
      />
    </ul>
  )
}
