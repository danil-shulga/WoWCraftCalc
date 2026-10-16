import { ItemTreeRow } from '../ItemTreeRow/ItemTreeRow'
import type { HTMLAttributes, ReactNode } from 'react'
import { IconButton } from '../../ui/IconButton/IconButton'
import type { Item, ItemId, ItemPriceField } from '../../../domain/item.types'
import { getItemName } from '../../../domain/item-names'
import type { ItemLanguage } from '../../../domain/user-settings'
import { ItemPriceCell } from './ItemPriceCell'
import { ItemIdentity } from '../../ui/ItemIdentity/ItemIdentity'
import { MoneyDisplay } from '../../ui/MoneyDisplay/MoneyDisplay'
import './RootItemRow.css'
import {
  PlanQuantityControl,
  type PlanQuantityControlProps,
} from '../../../features/planner/PlanQuantityControl'

export interface RootItemValuation {
  label: string
  value: number | null
  profitLabel: string
  profit: number | null
  allProfessionsProfit: number | null
  boughtReagentsProfit: number | null
  buyProfit: number | null
  description: string
  tooltip?: ReactNode
}

interface RootItemRowProps {
  valuation?: RootItemValuation | undefined
  planner?: PlanQuantityControlProps | undefined
  dragAndDrop?: HTMLAttributes<HTMLElement> | undefined
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
  onToggleFavorite?: ((itemId: ItemId) => void) | undefined
}

export function RootItemRow({
  valuation,
  planner,
  dragAndDrop,
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
  onToggleFavorite,
}: RootItemRowProps) {
  const itemName = getItemName(item, itemLanguage)
  const profit = valuation ? valuation.profit : configuredProfit

  return (
    <ItemTreeRow
      dragAndDrop={dragAndDrop}
      className="root-item-row"
      hasRecipe={item.recipe !== null}
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
          title={valuation?.label ?? 'Продажа'}
          editLabel="Цена продажи"
          itemName={itemName}
          value={valuation ? valuation.value : salePrice}
          isTsm={valuation ? false : saleIsTsm}
          field="salePriceCopper"
          quickPriceEdit={valuation ? undefined : quickPriceEdit}
          description={valuation?.description}
          tooltip={valuation?.tooltip}
        />
        <div>
          <dt>{valuation?.profitLabel ?? 'Прибыль за крафт'}</dt>
          <dd
            className={`profit-value ${
              profit === null ? '' : profit >= 0 ? 'money-positive' : 'money-negative'
            }`}
            tabIndex={0}
          >
            <MoneyDisplay value={profit} />
            <span className="profit-tooltip" role="tooltip">
              {valuation ? (
                <span>
                  Купить и распылить:{' '}
                  <strong>
                    <MoneyDisplay value={valuation.buyProfit} />
                  </strong>
                </span>
              ) : null}
              <span>
                Все профессии:{' '}
                <strong>
                  <MoneyDisplay
                    value={
                      valuation ? valuation.allProfessionsProfit : allProfessionsProfit
                    }
                  />
                </strong>
              </span>
              <span>
                Все реагенты купить:{' '}
                <strong>
                  <MoneyDisplay
                    value={
                      valuation ? valuation.boughtReagentsProfit : boughtReagentsProfit
                    }
                  />
                </strong>
              </span>
            </span>
          </dd>
        </div>
      </dl>

      <div className="item-row__actions">
        {planner ? <PlanQuantityControl {...planner} /> : null}
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
