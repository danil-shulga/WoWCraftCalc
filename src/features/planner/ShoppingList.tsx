import { ItemIdentity } from '../../components/ui/ItemIdentity/ItemIdentity'
import { MoneyDisplay } from '../../components/ui/MoneyDisplay/MoneyDisplay'
import { FormError } from '../../components/ui/FormError/FormError'
import { getItemName } from '../../domain/item-names'
import type { ItemCatalog } from '../../domain/item.types'
import type { PlannerResult } from '../../domain/planner.types'
import type { ItemLanguage } from '../../domain/user-settings'
import './ShoppingList.css'

export interface ShoppingListProps {
  plan: PlannerResult
  catalog: ItemCatalog
  itemLanguage: ItemLanguage
  compact?: boolean
}

export function ShoppingList({
  plan,
  catalog,
  itemLanguage,
  compact = false,
}: ShoppingListProps) {
  return (
    <div className={`shopping-list${compact ? ' shopping-list--compact' : ''}`}>
      {plan.errors.map((error) => (
        <FormError key={error} message={error} />
      ))}
      {plan.purchases.length === 0 && plan.errors.length === 0 ? (
        <p className="shopping-list__empty">
          Добавьте предметы в план тележкой в каталоге или выберите их в планировщике.
        </p>
      ) : null}
      <ul className="shopping-list__items">
        {plan.purchases.map((line) => {
          const item = catalog[line.itemId]
          if (!item) return null
          return (
            <li key={line.itemId} className="shopping-list__item">
              <ItemIdentity
                item={item}
                language={itemLanguage}
                iconSize="small"
                showSecondaryName={!compact}
              >
                <span className="shopping-list__quantity">× {line.quantity}</span>
              </ItemIdentity>
              <dl className="shopping-list__prices">
                <div>
                  <dt>За штуку{line.priceSource === 'tsm' ? ' · TSM' : ''}</dt>
                  <dd>
                    <MoneyDisplay value={line.unitPrice} />
                  </dd>
                </div>
                <div>
                  <dt>Сумма</dt>
                  <dd>
                    <MoneyDisplay value={line.cost} />
                  </dd>
                </div>
              </dl>
              {!compact && line.neededFor.length > 0 ? (
                <details className="shopping-list__dependencies">
                  <summary>Нужен для</summary>
                  <p>
                    {line.neededFor
                      .map((id) =>
                        catalog[id] ? getItemName(catalog[id], itemLanguage) : id,
                      )
                      .join(', ')}
                  </p>
                </details>
              ) : null}
              {!compact && line.additionalQuantity > 0 ? (
                <p className="shopping-list__dependencies">
                  Дополнительно: {line.additionalQuantity}; для производства:{' '}
                  {line.productionQuantity}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
      <dl className="shopping-list__totals">
        <div>
          <dt>Бюджет</dt>
          <dd>
            <MoneyDisplay value={plan.budget} />
          </dd>
        </div>
        {plan.missingPrices > 0 ? (
          <>
            <div>
              <dt>Известная часть</dt>
              <dd>
                <MoneyDisplay value={plan.knownBudget} />
              </dd>
            </div>
            <div>
              <dt>Позиций без цены</dt>
              <dd>{plan.missingPrices}</dd>
            </div>
          </>
        ) : null}
      </dl>
    </div>
  )
}
