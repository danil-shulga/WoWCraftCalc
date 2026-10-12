import type { ComponentProps } from 'react'
import { ItemIdentity } from '../ItemIdentity/ItemIdentity'
import './ItemQuantityList.css'

interface ItemQuantityListProps {
  items: readonly {
    key: string | number
    item: ComponentProps<typeof ItemIdentity>['item']
    quantity: number
  }[]
  language: ComponentProps<typeof ItemIdentity>['language']
  label: string
  showSecondaryName?: boolean
}

export function ItemQuantityList({
  items,
  language,
  label,
  showSecondaryName = true,
}: ItemQuantityListProps) {
  return (
    <ul className="item-quantity-list" aria-label={label}>
      {items.map(({ key, item, quantity }) => (
        <li key={key}>
          <ItemIdentity
            item={item}
            language={language}
            iconSize="small"
            showSecondaryName={showSecondaryName}
          />
          <strong className="item-quantity-list__quantity">× {quantity}</strong>
        </li>
      ))}
    </ul>
  )
}
