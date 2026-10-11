import { getItemName, getSecondaryItemName } from '../../../domain/item-names'
import type { Item } from '../../../domain/item.types'
import type { ItemLanguage } from '../../../domain/user-settings'
import './ItemName.css'

interface ItemNameProps {
  item: Pick<Item, 'name' | 'names'>
  language: ItemLanguage
}

export function ItemName({ item, language }: ItemNameProps) {
  const secondaryName = getSecondaryItemName(item, language)
  return (
    <span className="item-name">
      <span>{getItemName(item, language)}</span>
      {secondaryName ? (
        <small className="item-name__secondary">{secondaryName}</small>
      ) : null}
    </span>
  )
}
