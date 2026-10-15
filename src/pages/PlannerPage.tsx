import { useState } from 'react'
import { Button } from '../components/ui/Button/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog/ConfirmDialog'
import { ItemIdentity } from '../components/ui/ItemIdentity/ItemIdentity'
import { MoneyDisplay } from '../components/ui/MoneyDisplay/MoneyDisplay'
import { SearchableSelect } from '../components/ui/SearchableSelect/SearchableSelect'
import {
  getItemName,
  getItemSearchNames,
  getSecondaryItemName,
} from '../domain/item-names'
import { PlanQuantityControl } from '../features/planner/PlanQuantityControl'
import { ShoppingList, type ShoppingListProps } from '../features/planner/ShoppingList'
import { useCraftStore } from '../store/useCraftStore'
import './PageLayout.css'
import './PlannerPage.css'

export function PlannerPage({ plan, catalog, itemLanguage }: ShoppingListProps) {
  const setQuantity = useCraftStore((state) => state.setPlannerQuantity)
  const removeTarget = useCraftStore((state) => state.removePlannerTarget)
  const clearPlanner = useCraftStore((state) => state.clearPlanner)
  const [selectedId, setSelectedId] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const available = Object.values(catalog)
    .filter((item) => !plan.targets.some((target) => target.itemId === item.id))
    .sort((a, b) =>
      getItemName(a, itemLanguage).localeCompare(
        getItemName(b, itemLanguage),
        itemLanguage,
      ),
    )
  const options = available.map((item) => ({
    value: item.id,
    item,
    label: getItemName(item, itemLanguage),
    secondaryLabel: getSecondaryItemName(item, itemLanguage),
    searchNames: getItemSearchNames(item),
  }))
  const selected = available.find((item) => item.id === selectedId)
  const hasProduction = plan.targets.some((target) => target.method === 'craft')
  return (
    <section className="page planner-page">
      <header className="page__header">
        <div>
          <h1>Планировщик</h1>
          <p>
            Соберите цели: общие реагенты объединяются, промежуточные изделия
            рассчитываются целыми партиями.
          </p>
        </div>
        <Button
          variant="danger-text"
          disabled={plan.targets.length === 0}
          onClick={() => {
            setConfirmClear(true)
          }}
        >
          Очистить план
        </Button>
      </header>
      <div className="planner-page__add">
        <SearchableSelect
          label="Предмет для плана"
          itemLanguage={itemLanguage}
          options={options}
          value={selectedId}
          onChange={setSelectedId}
          showSecondaryLabel={false}
        />
        <Button
          variant="primary"
          disabled={!selected}
          onClick={() => {
            if (!selected) return
            setQuantity(selected.id, selected.recipe?.outputQuantity ?? 1)
            setSelectedId('')
          }}
        >
          Добавить в план
        </Button>
      </div>
      {plan.targets.length === 0 ? (
        <div className="empty-state">
          <strong>План пока пуст</strong>
          <p>
            Выберите предмет выше или нажмите тележку в крафтах, реагентах или избранном.
          </p>
        </div>
      ) : null}
      <div className="planner-page__layout">
        <div className="planner-page__production">
          {(['craft', 'buy'] as const).map((method) => {
            const targets = plan.targets.filter((target) => target.method === method)
            if (!targets.length) return null
            return (
              <section key={method} className="planner-page__card">
                <h2>
                  {method === 'craft' ? 'К изготовлению' : 'Дополнительные покупки'}
                </h2>
                <ul className="planner-page__rows">
                  {targets.map((target) => {
                    const item = catalog[target.itemId]
                    if (!item) return null
                    const step = plan.steps.find((entry) => entry.itemId === item.id)
                    return (
                      <li key={item.id} className="planner-page__target">
                        <ItemIdentity
                          item={item}
                          language={itemLanguage}
                          iconSize="medium"
                        />
                        <PlanQuantityControl
                          itemName={getItemName(item, itemLanguage)}
                          quantity={target.quantity}
                          step={item.recipe?.outputQuantity ?? 1}
                          onChange={(quantity) => {
                            setQuantity(item.id, quantity)
                          }}
                          onRemove={() => {
                            removeTarget(item.id)
                          }}
                        />
                        <p className="planner-page__note">
                          {item.recipe ? (
                            <>
                              Выход за крафт: {item.recipe.outputQuantity}.{' '}
                              {step ? (
                                <>
                                  Всего партий: {step.craftCount}; выход:{' '}
                                  {step.producedQuantity}; остаток: {step.surplusQuantity}
                                  .
                                </>
                              ) : null}
                            </>
                          ) : (
                            'Нет рецепта: прямая покупка.'
                          )}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
          {plan.warnings.length > 0 ? (
            <section className="planner-page__card">
              <h2>Примечания</h2>
              <ul className="planner-page__warnings">
                {plan.warnings.map((warning) => {
                  const item = catalog[warning.itemId]
                  return (
                    <li key={`${warning.itemId}-${warning.message}`}>
                      <strong>
                        {item ? getItemName(item, itemLanguage) : warning.itemId}
                      </strong>
                      : {warning.message}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
          {plan.steps.length > 0 ? (
            <section className="planner-page__card">
              <h2>Порядок крафта</h2>
              <ol className="planner-page__steps">
                {plan.steps.map((step) => {
                  const item = catalog[step.itemId]
                  if (!item) return null
                  return (
                    <li key={step.itemId}>
                      <ItemIdentity
                        item={item}
                        language={itemLanguage}
                        iconSize="small"
                      />
                      <p>
                        Крафтов: {step.craftCount}; требуется: {step.requiredQuantity};
                        выход: {step.producedQuantity}; остаток: {step.surplusQuantity}.
                      </p>
                    </li>
                  )
                })}
              </ol>
            </section>
          ) : null}
        </div>
        <div className="planner-page__production">
          <section className="planner-page__card" aria-label="Список покупок">
            <h2>Список покупок</h2>
            <ShoppingList plan={plan} catalog={catalog} itemLanguage={itemLanguage} />
          </section>
          {plan.targets.length > 0 ? (
            <section className="planner-page__card">
              <h2>Итоги</h2>
              <dl className="planner-page__totals">
                <div>
                  <dt>Покупки для производства</dt>
                  <dd>
                    <MoneyDisplay value={plan.productionBudget} />
                  </dd>
                </div>
                <div>
                  <dt>Дополнительные покупки</dt>
                  <dd>
                    <MoneyDisplay value={plan.additionalBudget} />
                  </dd>
                </div>
                {hasProduction ? (
                  <>
                    <div>
                      <dt>Выручка конечных целей</dt>
                      <dd>
                        <MoneyDisplay value={plan.revenue} />
                      </dd>
                    </div>
                    <div>
                      <dt>Прибыль производства</dt>
                      <dd>
                        <MoneyDisplay value={plan.profit} />
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
      {confirmClear ? (
        <ConfirmDialog
          title="Очистить план?"
          message="Все цели текущей версии будут удалены из плана. Предметы и рецепты останутся в каталоге."
          confirmLabel="Очистить"
          onCancel={() => {
            setConfirmClear(false)
          }}
          onConfirm={() => {
            clearPlanner()
            setConfirmClear(false)
          }}
        />
      ) : null}
    </section>
  )
}
