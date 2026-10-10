import {
  getCraftUnitCost,
  getProfitPerCraft,
  getSelectedUnitCost,
} from '../../../domain/calculations'
import { formatMoney } from '../../../domain/money'
import type {
  AcquisitionMethod,
  ItemCatalog,
  ItemId,
  ItemPriceField,
  RecipeLine,
} from '../../../domain/item.types'
import { AcquisitionMethodPicker } from '../../ui/AcquisitionMethodPicker/AcquisitionMethodPicker'
import { InlineMoneyInput } from '../../ui/InlineMoneyInput/InlineMoneyInput'
import { ItemIcon } from '../../ui/ItemIcon/ItemIcon'
import '../../ui/IconButton.css'
import './ItemTree.css'

interface QuickPriceEdit {
  field: ItemPriceField
  value: number | null
  onChange: (value: number | null) => void
}

interface ItemTreeProps {
  rootItemId: ItemId
  catalog: ItemCatalog
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

  const craftUnitCost = getCraftUnitCost(catalog, itemId)
  const hasRecipe = item.recipe !== null
  const isExpanded = expandedPaths.has(path)
  const hasCycle = visited.has(itemId)
  const selectedCost =
    recipeLine === null
      ? null
      : getSelectedUnitCost(catalog, itemId, recipeLine.acquisition)
  const nextVisited = new Set(visited)
  nextVisited.add(itemId)

  return (
    <li className="item-tree__node">
      <article className="item-row" data-depth={depth}>
        <button
          className="expand-button"
          type="button"
          aria-label={isExpanded ? 'Свернуть рецепт' : 'Развернуть рецепт'}
          disabled={!hasRecipe || hasCycle}
          onClick={() => {
            onToggleExpanded(path)
          }}
        >
          {hasRecipe ? (isExpanded ? '▾' : '▸') : '·'}
        </button>

        <ItemIcon iconUrl={item.iconUrl} itemName={item.name} />

        <div className="item-row__identity">
          <strong>{item.name}</strong>
          {recipeLine === null ? null : (
            <span className="item-row__quantity">× {recipeLine.quantity}</span>
          )}
        </div>

        <dl className="item-row__prices">
          <div>
            <dt>Покупка</dt>
            {recipeLine === null && quickPriceEdit?.field === 'purchasePriceCopper' ? (
              <dd className="item-row__price-editor">
                <InlineMoneyInput
                  label={`Цена покупки: ${item.name}`}
                  value={quickPriceEdit.value}
                  onChange={quickPriceEdit.onChange}
                />
              </dd>
            ) : (
              <dd>{formatMoney(item.purchasePriceCopper)}</dd>
            )}
          </div>
          <div>
            <dt>Крафт</dt>
            <dd>{formatMoney(craftUnitCost)}</dd>
          </div>
          {recipeLine === null ? (
            <>
              <div>
                <dt>Продажа</dt>
                {quickPriceEdit?.field === 'salePriceCopper' ? (
                  <dd className="item-row__price-editor">
                    <InlineMoneyInput
                      label={`Цена продажи: ${item.name}`}
                      value={quickPriceEdit.value}
                      onChange={quickPriceEdit.onChange}
                    />
                  </dd>
                ) : (
                  <dd>{formatMoney(item.salePriceCopper)}</dd>
                )}
              </div>
              <div>
                <dt>Прибыль за крафт</dt>
                <dd
                  className={
                    (getProfitPerCraft(catalog, itemId) ?? 0) >= 0
                      ? 'money-positive'
                      : 'money-negative'
                  }
                >
                  {formatMoney(getProfitPerCraft(catalog, itemId))}
                </dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Выбрано</dt>
              <dd>{formatMoney(selectedCost)}</dd>
            </div>
          )}
        </dl>

        {recipeLine === null || parentItemId === null ? null : (
          <AcquisitionMethodPicker
            value={recipeLine.acquisition}
            purchasePrice={item.purchasePriceCopper}
            craftPrice={craftUnitCost}
            canBuy={item.purchasePriceCopper !== null}
            canCraft={hasRecipe}
            onChange={(acquisition) => {
              onSetAcquisition(parentItemId, itemId, acquisition)
            }}
          />
        )}

        <div className="item-row__actions">
          <button
            className="icon-button"
            type="button"
            title="Редактировать предмет"
            aria-label={`Редактировать ${item.name}`}
            onClick={() => {
              onEditItem(itemId)
            }}
          >
            ✎
          </button>
          <button
            className="icon-button"
            type="button"
            title="Редактировать рецепт"
            aria-label={`Редактировать рецепт ${item.name}`}
            onClick={() => {
              onEditRecipe(itemId)
            }}
          >
            ⚒
          </button>
          {depth === 0 ? (
            <button
              className="icon-button icon-button--danger"
              type="button"
              title="Удалить предмет"
              aria-label={`Удалить ${item.name}`}
              onClick={() => {
                onDeleteItem(itemId)
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      </article>

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
