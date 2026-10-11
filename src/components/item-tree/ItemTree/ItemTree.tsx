import type { CatalogCalculationSnapshot } from '../../../domain/calculations'
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
  rootItemId: ItemId
  catalog: ItemCatalog
  calculationSnapshot: CatalogCalculationSnapshot
  quickPriceEdit?: QuickPriceEdit
  expandedPaths: ReadonlySet<string>
  onToggleExpanded: (path: string) => void
  onEditItem: (itemId: ItemId) => void
  onEditRecipe: (itemId: ItemId) => void
  onDeleteItem: (itemId: ItemId) => void
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
  itemId,
  path,
  parentItemId,
  recipeLine,
  catalog,
  calculationSnapshot,
  quickPriceEdit,
  expandedPaths,
  onToggleExpanded,
  onEditItem,
  onEditRecipe,
  onDeleteItem,
  onSetAcquisition,
  visited,
  rootItemId,
}: ItemTreeNodeProps) {
  const item = catalog[itemId]
  const calculation = calculationSnapshot[itemId]

  if (item === undefined || calculation === undefined) {
    return null
  }

  const hasRecipe = item.recipe !== null
  const isExpanded = expandedPaths.has(path)
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
          item={item}
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
          onEditRecipe={onEditRecipe}
          onDeleteItem={onDeleteItem}
        />
      ) : parentItemId === null ? null : (
        <ReagentItemRow
          item={item}
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
          onEditRecipe={onEditRecipe}
          onSetAcquisition={onSetAcquisition}
        />
      )}

      {isExpanded && hasRecipe && !hasCycle ? (
        <ul className="item-tree item-tree--nested">
          {item.recipe?.reagents.map((line) => (
            <ItemTreeNode
              key={line.itemId}
              rootItemId={rootItemId}
              itemId={line.itemId}
              path={`${path}/${line.itemId}`}
              parentItemId={itemId}
              recipeLine={line}
              catalog={catalog}
              calculationSnapshot={calculationSnapshot}
              expandedPaths={expandedPaths}
              onToggleExpanded={onToggleExpanded}
              onEditItem={onEditItem}
              onEditRecipe={onEditRecipe}
              onDeleteItem={onDeleteItem}
              onSetAcquisition={onSetAcquisition}
              visited={nextVisited}
            />
          ))}
        </ul>
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
