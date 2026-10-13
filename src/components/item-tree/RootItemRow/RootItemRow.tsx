import { ItemTreeRow } from '../ItemTreeRow/ItemTreeRow'
import { IconButton } from '../../ui/IconButton/IconButton'
import type { Item, ItemId, ItemPriceField } from '../../../domain/item.types'
import { getItemName } from '../../../domain/item-names'
import type { ItemLanguage } from '../../../domain/user-settings'
import { ItemPriceCell } from './ItemPriceCell'
import { ItemIdentity } from '../../ui/ItemIdentity/ItemIdentity'
import { MoneyDisplay } from '../../ui/MoneyDisplay/MoneyDisplay'
import './RootItemRow.css'

interface RootItemRowProps {
  showPurchasePrice?: boolean
  purchasePrice: number | null
  salePrice: number | null
  purchaseIsTsm: boolean
  saleIsTsm: boolean
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
  showPurchasePrice = true,
  purchasePrice,
  salePrice,
  purchaseIsTsm,
  saleIsTsm,
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
    <ItemTreeRow
      className="root-item-row"
      hasRecipe={item.recipe !== null}
      hasCycle={hasCycle}
      isExpanded={isExpanded}
      onToggle={onToggleExpanded}
    >
      <ItemIdentity
        item={item}
        language={itemLanguage}
        nameAs="strong"
        truncate={quickPriceEdit === undefined}
        className="item-row__identity"
      />

      <dl
        className={`root-item-row__prices item-row__prices${showPurchasePrice ? ' root-item-row__prices--with-purchase' : ''}`}
      >
        {showPurchasePrice ? (
          <ItemPriceCell
            title="Покупка"
            editLabel="Цена покупки"
            itemName={itemName}
            value={purchasePrice}
            isTsm={purchaseIsTsm}
            field="purchasePriceCopper"
            quickPriceEdit={quickPriceEdit}
          />
        ) : null}
        <div>
          <dt>Крафт</dt>
          <dd>
            <MoneyDisplay value={craftUnitCost} />
          </dd>
        </div>
        <ItemPriceCell
          title="Продажа"
          editLabel="Цена продажи"
          itemName={itemName}
          value={salePrice}
          isTsm={saleIsTsm}
          field="salePriceCopper"
          quickPriceEdit={quickPriceEdit}
        />
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
    </ItemTreeRow>
  )
}
