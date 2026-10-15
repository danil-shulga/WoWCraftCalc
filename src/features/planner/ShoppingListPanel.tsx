import { useId, useState } from 'react'
import { Button } from '../../components/ui/Button/Button'
import { MoneyDisplay } from '../../components/ui/MoneyDisplay/MoneyDisplay'
import { ShoppingList, type ShoppingListProps } from './ShoppingList'
import './ShoppingListPanel.css'

export function ShoppingListPanel({
  onOpenPlanner,
  ...props
}: ShoppingListProps & { onOpenPlanner: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const contentId = useId()

  if (props.plan.purchases.length === 0) return null

  return (
    <aside className="shopping-list-panel" aria-label="Список покупок">
      <Button
        variant="plain"
        className="shopping-list-panel__toggle"
        aria-label={isExpanded ? 'Свернуть список покупок' : 'Развернуть список покупок'}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={() => {
          setIsExpanded((expanded) => !expanded)
        }}
      >
        <span>{isExpanded ? 'Список покупок' : 'Бюджет'}</span>
        {isExpanded ? null : <MoneyDisplay value={props.plan.budget} />}
      </Button>
      <div className="shopping-list-panel__content" id={contentId} hidden={!isExpanded}>
        <span className="shopping-list-panel__count">
          Позиций: {props.plan.purchases.length}
        </span>
        <ShoppingList {...props} compact />
        <Button variant="secondary" onClick={onOpenPlanner}>
          Открыть планировщик
        </Button>
      </div>
    </aside>
  )
}
