import { Button } from '../../ui/Button/Button'
import './ItemExpandButton.css'

interface ItemExpandButtonProps {
  hasRecipe: boolean
  hasCycle: boolean
  isExpanded: boolean
  onToggle: () => void
}

export function ItemExpandButton({
  hasRecipe,
  hasCycle,
  isExpanded,
  onToggle,
}: ItemExpandButtonProps) {
  return (
    <Button
      variant="plain"
      className="expand-button"
      aria-label={isExpanded ? 'Свернуть рецепт' : 'Развернуть рецепт'}
      disabled={!hasRecipe || hasCycle}
      onClick={onToggle}
    >
      {hasRecipe ? (isExpanded ? '▾' : '▸') : '·'}
    </Button>
  )
}
