import { ItemExpandButton } from '../ItemExpandButton/ItemExpandButton'
import { IconButton } from '../../ui/IconButton/IconButton'
import type { Item, ItemId, ItemPriceField } from '../../../domain/item.types'
import { getItemName } from '../../../domain/item-names'
import type { ItemLanguage } from '../../../domain/user-settings'
import { InlineMoneyInput } from '../../ui/InlineMoneyInput/InlineMoneyInput'
import { ItemIdentity } from '../../ui/ItemIdentity/ItemIdentity'
import { MoneyDisplay } from '../../ui/MoneyDisplay/MoneyDisplay'
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
  onDeleteItem,
}: RootItemRowProps) {
  const itemName = getItemName(item, itemLanguage)

  return (
    <article className="root-item-row">
      <ItemExpandButton
        hasRecipe={item.recipe !== null}
        hasCycle={hasCycle}
        isExpanded={isExpanded}
        onToggle={onToggleExpanded}
      />

      <ItemIdentity
        item={item}
        language={itemLanguage}
        nameAs="strong"
        truncate
        className="item-row__identity"
      />

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
        <IconButton
          type="button"
          title="Редактировать предмет"
          aria-label={`Редактировать ${itemName}`}
          onClick={() => {
            onEditItem(item.id)
          }}
        >
          ✎
        </IconButton>
        <IconButton
          variant="danger"
          type="button"
          title="Удалить предмет"
          aria-label={`Удалить ${itemName}`}
          onClick={() => {
            onDeleteItem(item.id)
          }}
        >
          ×
        </IconButton>
      </div>
    </article>
  )
}
