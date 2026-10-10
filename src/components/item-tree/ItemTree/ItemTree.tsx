import {
  getAutomaticAcquisitionMethod,
  getCraftUnitCost,
  getProfitPerCraft,
  getSelectedUnitCost,
} from '../../../domain/calculations'
import type {
  AcquisitionMethod,
  ItemCatalog,
  ItemId,
  ItemPriceField,
  RecipeLine,
} from '../../../domain/item.types'
import type { Profession } from '../../../domain/professions'
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
  ownedProfessions: readonly Profession[]
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
  depth: number
  parentItemId: ItemId | null
  recipeLine: RecipeLine | null
  visited: ReadonlySet<ItemId>
}

function ItemTreeNode({
  itemId,
  path,
  depth,
  parentItemId,
  recipeLine,
  catalog,
  ownedProfessions,
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

  if (item === undefined) {
    return null
  }

  const ownedProfessionSet = new Set(ownedProfessions)
  const calculationOptions = { ownedProfessions: ownedProfessionSet }
  const craftUnitCost = getCraftUnitCost(catalog, itemId, calculationOptions)
  const hasRecipe = item.recipe !== null
  const isExpanded = expandedPaths.has(path)
  const hasCycle = visited.has(itemId)
  const selectedCost =
    recipeLine === null
      ? null
      : getSelectedUnitCost(catalog, itemId, recipeLine.acquisition, calculationOptions)
  const automaticMethod = getAutomaticAcquisitionMethod(
    catalog,
    itemId,
    ownedProfessionSet,
  )
  const configuredProfit = getProfitPerCraft(catalog, itemId, calculationOptions)
  const allProfessionsProfit = getProfitPerCraft(catalog, itemId, {
    scenario: 'all-professions',
  })
  const boughtReagentsProfit = getProfitPerCraft(catalog, itemId, {
    scenario: 'buy-reagents',
  })
  const nextVisited = new Set(visited)
  nextVisited.add(itemId)

  return (
    <li className="item-tree__node">
      {recipeLine === null ? (
        <RootItemRow
          item={item}
          isExpanded={isExpanded}
          hasCycle={hasCycle}
          craftUnitCost={craftUnitCost}
          configuredProfit={configuredProfit}
          allProfessionsProfit={allProfessionsProfit}
          boughtReagentsProfit={boughtReagentsProfit}
          quickPriceEdit={quickPriceEdit}
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
          craftUnitCost={craftUnitCost}
          selectedCost={selectedCost}
          automaticMethod={automaticMethod}
          onToggleExpanded={() => {
            onToggleExpanded(path)
          }}
          onEditItem={onEditItem}
          onEditRecipe={onEditRecipe}
          onSetAcquisition={onSetAcquisition}
        />
      )}

      {isExpanded && hasRecipe && !hasCycle ? (
        item.recipe?.reagents.length === 0 ? (
          <p className="empty-recipe">В рецепте пока нет реагентов.</p>
        ) : (
          <ul className="item-tree item-tree--nested">
            {item.recipe?.reagents.map((line) => (
              <ItemTreeNode
                key={line.itemId}
                rootItemId={rootItemId}
                itemId={line.itemId}
                path={`${path}/${line.itemId}`}
                depth={depth + 1}
                parentItemId={itemId}
                recipeLine={line}
                catalog={catalog}
                ownedProfessions={ownedProfessions}
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
        )
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
        depth={0}
        parentItemId={null}
        recipeLine={null}
        visited={new Set()}
      />
    </ul>
  )
}
