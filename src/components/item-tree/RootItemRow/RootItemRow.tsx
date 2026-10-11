import type { Item, ItemId, ItemPriceField } from '../../../domain/item.types'
import { getItemName } from '../../../domain/item-names'
import type { ItemLanguage } from '../../../domain/user-settings'
import { InlineMoneyInput } from '../../ui/InlineMoneyInput/InlineMoneyInput'
import { ItemIcon } from '../../ui/ItemIcon/ItemIcon'
import { ItemName } from '../../ui/ItemName/ItemName'
import { MoneyDisplay } from '../../ui/MoneyDisplay/MoneyDisplay'
import '../../ui/IconButton.css'
import './RootItemRow.css'

interface RootItemRowProps {
  item: Item
  itemLanguage: ItemLanguage
  isExpanded: boolean
  hasCycle: boolean
  craftUnitCost: number | null
  configuredProfit: number | null
  allProfessionsProfit: number | null
  boughtReagentsProfit: number | null
  quickPriceEdit?: {
    field: ItemPriceField
    value: number | null
    onChange: (value: number | null) => void
  }
  onToggleExpanded: () => void
  onEditItem: (itemId: ItemId) => void
  onEditRecipe: (itemId: ItemId) => void
  onDeleteItem: (itemId: ItemId) => void
}

export function RootItemRow({
  item,
  itemLanguage,
  isExpanded,
  hasCycle,
  craftUnitCost,
  configuredProfit,
  allProfessionsProfit,
  boughtReagentsProfit,
  quickPriceEdit,
  onToggleExpanded,
  onEditItem,
  onEditRecipe,
  onDeleteItem,
}: RootItemRowProps) {
  const hasRecipe = item.recipe !== null
  const itemName = getItemName(item, itemLanguage)

  return (
    <article className="root-item-row">
      <button
        className="expand-button"
        type="button"
        aria-label={isExpanded ? 'Свернуть рецепт' : 'Развернуть рецепт'}
        disabled={!hasRecipe || hasCycle}
        onClick={onToggleExpanded}
      >
        {hasRecipe ? (isExpanded ? '▾' : '▸') : '·'}
      </button>

      <ItemIcon iconUrl={item.iconUrl} itemName={itemName} />

      <div className="item-row__identity">
        <strong>
          <ItemName item={item} language={itemLanguage} />
        </strong>
      </div>

      <dl className="root-item-row__prices item-row__prices">
        <div>
          <dt>Покупка</dt>
          {quickPriceEdit?.field === 'purchasePriceCopper' ? (
            <dd className="item-row__price-editor">
              <InlineMoneyInput
                label={`Цена покупки: ${itemName}`}
                value={quickPriceEdit.value}
                onChange={quickPriceEdit.onChange}
              />
            </dd>
          ) : (
            <dd>
              <MoneyDisplay value={item.purchasePriceCopper} />
            </dd>
          )}
        </div>
        <div>
          <dt>Крафт</dt>
          <dd>
            <MoneyDisplay value={craftUnitCost} />
          </dd>
        </div>
        <div>
          <dt>Продажа</dt>
          {quickPriceEdit?.field === 'salePriceCopper' ? (
            <dd className="item-row__price-editor">
              <InlineMoneyInput
                label={`Цена продажи: ${itemName}`}
                value={quickPriceEdit.value}
                onChange={quickPriceEdit.onChange}
              />
            </dd>
          ) : (
            <dd>
              <MoneyDisplay value={item.salePriceCopper} />
            </dd>
          )}
        </div>
        <div>
          <dt>Прибыль за крафт</dt>
          <dd
            className={`profit-value ${
              (configuredProfit ?? 0) >= 0 ? 'money-positive' : 'money-negative'
            }`}
            tabIndex={0}
          >
            <MoneyDisplay value={configuredProfit} />
            <span className="profit-tooltip" role="tooltip">
              <span>
                Все профессии:{' '}
                <strong>
                  <MoneyDisplay value={allProfessionsProfit} />
                </strong>
              </span>
              <span>
                Все реагенты купить:{' '}
                <strong>
                  <MoneyDisplay value={boughtReagentsProfit} />
                </strong>
              </span>
            </span>
          </dd>
        </div>
      </dl>

      <div className="item-row__actions">
        <button
          className="icon-button"
          type="button"
          title="Редактировать предмет"
          aria-label={`Редактировать ${itemName}`}
          onClick={() => {
            onEditItem(item.id)
          }}
        >
          ✎
        </button>
        <button
          className="icon-button"
          type="button"
          title="Редактировать рецепт"
          aria-label={`Редактировать рецепт ${itemName}`}
          onClick={() => {
            onEditRecipe(item.id)
          }}
        >
          ⚒
        </button>
        <button
          className="icon-button icon-button--danger"
          type="button"
          title="Удалить предмет"
          aria-label={`Удалить ${itemName}`}
          onClick={() => {
            onDeleteItem(item.id)
          }}
        >
          ×
        </button>
      </div>
    </article>
  )
}
