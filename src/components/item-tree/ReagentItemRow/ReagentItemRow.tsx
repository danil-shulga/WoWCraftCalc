import { ItemTreeRow } from '../ItemTreeRow/ItemTreeRow'
import { IconButton } from '../../ui/IconButton/IconButton'
import type {
  AcquisitionMethod,
  Item,
  ItemId,
  RecipeLine,
} from '../../../domain/item.types'
import { getTotalAcquisitionProfit } from '../../../domain/calculations'
import { getItemName } from '../../../domain/item-names'
import type { ItemLanguage } from '../../../domain/user-settings'
import { AcquisitionMethodPicker } from '../../ui/AcquisitionMethodPicker/AcquisitionMethodPicker'
import { ItemIdentity } from '../../ui/ItemIdentity/ItemIdentity'
import { MoneyDisplay } from '../../ui/MoneyDisplay/MoneyDisplay'
import './ReagentItemRow.css'

interface ReagentItemRowProps {
  purchasePrice: number | null
  item: Item
  itemLanguage: ItemLanguage
  parentItemId: ItemId
  recipeLine: RecipeLine
  isExpanded: boolean
  hasCycle: boolean
  craftUnitCost: number | null
  exactSelectedProfit: number | null
  automaticMethod: Exclude<AcquisitionMethod, 'auto'>
  onToggleExpanded: () => void
  onEditItem: (itemId: ItemId) => void
  onToggleFavorite?: ((itemId: ItemId) => void) | undefined
  onSetAcquisition: (
    ownerItemId: ItemId,
    reagentItemId: ItemId,
    acquisition: AcquisitionMethod,
  ) => void
}

export function ReagentItemRow({
  purchasePrice,
  item,
  itemLanguage,
  parentItemId,
  recipeLine,
  isExpanded,
  hasCycle,
  craftUnitCost,
  exactSelectedProfit,
  automaticMethod,
  onToggleExpanded,
  onEditItem,
  onToggleFavorite,
  onSetAcquisition,
}: ReagentItemRowProps) {
  const hasRecipe = item.recipe !== null
  const itemName = getItemName(item, itemLanguage)
  const selectedProfit = getTotalAcquisitionProfit(exactSelectedProfit, 1)
  const totalProfit = getTotalAcquisitionProfit(exactSelectedProfit, recipeLine.quantity)
  const profitToneClass =
    selectedProfit === null
      ? ''
      : selectedProfit >= 0
        ? 'money-positive'
        : 'money-negative'

  return (
    <ItemTreeRow
      className="reagent-item-row"
      hasRecipe={hasRecipe}
      hasCycle={hasCycle}
      isExpanded={isExpanded}
      onToggle={onToggleExpanded}
    >
      <ItemIdentity
        item={item}
        favorite={
          onToggleFavorite === undefined
            ? undefined
            : {
                selected: item.isFavorite ?? false,
                onToggle: () => {
                  onToggleFavorite(item.id)
                },
              }
        }
        language={itemLanguage}
        nameAs="strong"
        truncate
        className="item-row__identity"
        fitWrappedName
      >
        <span className="reagent-item-row__quantity">× {recipeLine.quantity}</span>
      </ItemIdentity>

      <dl className="reagent-item-row__prices item-row__prices">
        <div>
          <dt>Покупка</dt>
          <dd>
            <MoneyDisplay value={purchasePrice} />
          </dd>
        </div>
        <div>
          <dt>Крафт</dt>
          <dd>
            <MoneyDisplay value={craftUnitCost} />
          </dd>
        </div>
        <div>
          <dt>Выгода</dt>
          <dd
            className={
              totalProfit === null ? undefined : `profit-value ${profitToneClass}`
            }
            tabIndex={totalProfit === null ? undefined : 0}
          >
            <MoneyDisplay value={selectedProfit} />
            {totalProfit === null ? null : (
              <span className="profit-tooltip" role="tooltip">
                <span>
                  Суммарно за {recipeLine.quantity} шт.:{' '}
                  <strong>
                    <MoneyDisplay value={totalProfit} />
                  </strong>
                </span>
              </span>
            )}
          </dd>
        </div>
      </dl>

      <AcquisitionMethodPicker
        value={recipeLine.acquisition}
        purchasePrice={purchasePrice}
        craftPrice={craftUnitCost}
        automaticMethod={automaticMethod}
        canBuy={purchasePrice !== null}
        canCraft={hasRecipe}
        onChange={(acquisition) => {
          onSetAcquisition(parentItemId, item.id, acquisition)
        }}
      />

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
      </div>
    </ItemTreeRow>
  )
}
