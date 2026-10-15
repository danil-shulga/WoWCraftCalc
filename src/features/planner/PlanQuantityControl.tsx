import { useEffect, useRef, useState } from 'react'
import { IconButton } from '../../components/ui/IconButton/IconButton'
import { NumberInput } from '../../components/ui/NumberInput/NumberInput'
import { isPlannerQuantity } from '../../domain/planner'
import './PlanQuantityControl.css'

export interface PlanQuantityControlProps {
  itemName: string
  quantity: number | undefined
  step: number
  onChange: (quantity: number) => void
  onRemove: () => void
}

export function PlanQuantityControl({
  itemName,
  quantity,
  step,
  onChange,
  onRemove,
}: PlanQuantityControlProps) {
  const [focusOnAdd, setFocusOnAdd] = useState(false)
  const [visibleQuantity, setVisibleQuantity] = useState(quantity)
  const quantityRef = useRef<HTMLDivElement>(null)
  const selected = quantity !== undefined
  if (selected && visibleQuantity !== quantity) setVisibleQuantity(quantity)
  useEffect(() => {
    if (selected && focusOnAdd) quantityRef.current?.querySelector('input')?.focus()
  }, [selected, focusOnAdd])
  const label = `${selected ? 'Убрать из плана' : 'Добавить в план'}: ${itemName}`
  return (
    <div className="plan-quantity-control">
      {visibleQuantity !== undefined ? (
        <div
          ref={quantityRef}
          className={`plan-quantity-control__quantity${selected ? '' : ' plan-quantity-control__quantity--closing'}`}
          aria-hidden={!selected}
          inert={!selected}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && !selected) {
              setVisibleQuantity(undefined)
            }
          }}
        >
          <NumberInput
            value={visibleQuantity}
            min={1}
            max={Number.MAX_SAFE_INTEGER}
            step={step}
            ariaLabel={`Количество: ${itemName}`}
            disabled={!selected}
            isValidValue={isPlannerQuantity}
            onChange={onChange}
          />
        </div>
      ) : null}
      <IconButton
        aria-label={label}
        title={label}
        aria-pressed={selected}
        className="plan-quantity-control__cart"
        onClick={() => {
          setFocusOnAdd(!selected)
          if (selected) onRemove()
          else onChange(step)
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 3h2l3 13h10l3-9H6" />
          <circle cx="9" cy="20" r="1" />
          <circle cx="18" cy="20" r="1" />
        </svg>
      </IconButton>
    </div>
  )
}
