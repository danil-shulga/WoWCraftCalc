import type { ComponentProps, ReactNode } from 'react'
import { getItemName } from '../../../domain/item-names'
import { ItemIcon } from '../ItemIcon/ItemIcon'
import { ItemName } from '../ItemName/ItemName'
import './ItemIdentity.css'

interface ItemIdentityProps {
  item: ComponentProps<typeof ItemName>['item'] & { iconUrl: string }
  language: ComponentProps<typeof ItemName>['language']
  iconSize?: ComponentProps<typeof ItemIcon>['size']
  nameAs?: ComponentProps<typeof ItemName>['primaryAs']
  showIcon?: boolean
  showSecondaryName?: boolean
  truncate?: boolean
  className?: string
  children?: ReactNode
}

export function ItemIdentity({
  item,
  language,
  iconSize = 'large',
  nameAs = 'span',
  showIcon = true,
  showSecondaryName = true,
  truncate = false,
  className,
  children,
}: ItemIdentityProps) {
  const Container = nameAs === 'h3' ? 'div' : 'span'
  const classes = [
    'item-identity',
    nameAs === 'h3' ? 'item-identity--heading' : '',
    truncate ? 'item-identity--truncate' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Container className={classes}>
      {showIcon ? (
        <ItemIcon
          iconUrl={item.iconUrl}
          itemName={getItemName(item, language)}
          size={iconSize}
        />
      ) : null}
      <Container className="item-identity__text">
        <ItemName
          item={item}
          language={language}
          primaryAs={nameAs}
          showSecondaryName={showSecondaryName}
        />
        {children}
      </Container>
    </Container>
  )
}
