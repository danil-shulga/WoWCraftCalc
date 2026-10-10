import type {
  AcquisitionMethod,
  Item,
  ItemId,
  RecipeLine,
} from '../../../domain/item.types'
import { AcquisitionMethodPicker } from '../../ui/AcquisitionMethodPicker/AcquisitionMethodPicker'
import { ItemIcon } from '../../ui/ItemIcon/ItemIcon'
import { MoneyDisplay } from '../../ui/MoneyDisplay/MoneyDisplay'
import '../../ui/IconButton.css'
import './ReagentItemRow.css'

interface ReagentItemRowProps {
  item: Item
  parentItemId: ItemId
  recipeLine: RecipeLine
  isExpanded: boolean
  hasCycle: boolean
  craftUnitCost: number | null
  selectedCost: number | null
  automaticMethod: AcquisitionMethod
  onToggleExpanded: () => void
  onEditItem: (itemId: ItemId) => void
  onEditRecipe: (itemId: ItemId) => void
  onSetAcquisition: (
    ownerItemId: ItemId,
    reagentItemId: ItemId,
    acquisition: AcquisitionMethod,
  ) => void
}

export function ReagentItemRow({
  item,
  parentItemId,
  recipeLine,
  isExpanded,
  hasCycle,
  craftUnitCost,
  selectedCost,
  automaticMethod,
  onToggleExpanded,
  onEditItem,
  onEditRecipe,
  onSetAcquisition,
}: ReagentItemRowProps) {
  const hasRecipe = item.recipe !== null

  return (
    <article className="reagent-item-row">
      <button
        className="expand-button"
        type="button"
        aria-label={isExpanded ? 'Свернуть рецепт' : 'Развернуть рецепт'}
        disabled={!hasRecipe || hasCycle}
        onClick={onToggleExpanded}
      >
        {hasRecipe ? (isExpanded ? '▾' : '▸') : '·'}
      </button>

      <ItemIcon iconUrl={item.iconUrl} itemName={item.name} />

      <div className="item-row__identity">
        <strong>{item.name}</strong>
        <span className="reagent-item-row__quantity">× {recipeLine.quantity}</span>
      </div>

      <dl className="reagent-item-row__prices item-row__prices">
        <div>
          <dt>Покупка</dt>
          <dd>
            <MoneyDisplay value={item.purchasePriceCopper} />
          </dd>
        </div>
        <div>
          <dt>Крафт</dt>
          <dd>
            <MoneyDisplay value={craftUnitCost} />
          </dd>
        </div>
        <div>
          <dt>Выбрано</dt>
          <dd>
            <MoneyDisplay value={selectedCost} />
          </dd>
        </div>
      </dl>

      <AcquisitionMethodPicker
        value={recipeLine.acquisition}
        purchasePrice={item.purchasePriceCopper}
        craftPrice={craftUnitCost}
        automaticMethod={automaticMethod}
        canBuy={item.purchasePriceCopper !== null}
        canCraft={hasRecipe}
        onChange={(acquisition) => {
          onSetAcquisition(parentItemId, item.id, acquisition)
        }}
      />

      <div className="item-row__actions">
        <button
          className="icon-button"
          type="button"
          title="Редактировать предмет"
          aria-label={`Редактировать ${item.name}`}
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
          aria-label={`Редактировать рецепт ${item.name}`}
          onClick={() => {
            onEditRecipe(item.id)
          }}
        >
          ⚒
        </button>
      </div>
    </article>
  )
}
