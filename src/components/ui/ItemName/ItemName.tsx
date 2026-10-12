import { getItemName, getSecondaryItemName } from '../../../domain/item-names'
import type { Item } from '../../../domain/item.types'
import type { ItemLanguage } from '../../../domain/user-settings'
import './ItemName.css'

interface ItemNameProps {
  item: Pick<Item, 'name' | 'names'>
  language: ItemLanguage
  showSecondaryName?: boolean
  primaryAs?: 'span' | 'strong' | 'h3'
}

export function ItemName({
  item,
  language,
  showSecondaryName = true,
  primaryAs: Primary = 'span',
}: ItemNameProps) {
  const secondaryName = showSecondaryName ? getSecondaryItemName(item, language) : null
  const Container = Primary === 'h3' ? 'div' : 'span'
  return (
    <Container className="item-name">
      <Primary>{getItemName(item, language)}</Primary>
      {secondaryName ? (
        <small className="item-name__secondary">{secondaryName}</small>
      ) : null}
    </Container>
  )
}
