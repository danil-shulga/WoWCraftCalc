import type { ComponentProps, ReactNode } from 'react'
import { getItemName } from '../../../domain/item-names'
import { IconButton } from '../IconButton/IconButton'
import { ItemIcon } from '../ItemIcon/ItemIcon'
import { ItemName } from '../ItemName/ItemName'
import './ItemIdentity.css'

interface ItemIdentityProps {
  item: ComponentProps<typeof ItemName>['item'] & { iconUrl: string }
  language: ComponentProps<typeof ItemName>['language']
  iconSize?: ComponentProps<typeof ItemIcon>['size']
  favorite?: { selected: boolean; onToggle: () => void } | undefined
  nameAs?: ComponentProps<typeof ItemName>['primaryAs']
  fitWrappedName?: boolean
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
  favorite,
  nameAs = 'span',
  fitWrappedName = false,
  showIcon = true,
  showSecondaryName = true,
  truncate = false,
  className,
  children,
}: ItemIdentityProps) {
  const Container = nameAs === 'h3' ? 'div' : 'span'
  const favoriteLabel = favorite?.selected
    ? 'Удалить из избранного'
    : 'Добавить в избранное'
  const classes = [
    'item-identity',
    showIcon && iconSize === 'small' ? 'item-identity--small' : '',
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
          fitWrappedText={fitWrappedName}
          showSecondaryName={showSecondaryName}
        />
        {favorite ? (
          <IconButton
            className="item-identity__favorite"
            aria-label={`${favoriteLabel}: ${getItemName(item, language)}`}
            aria-pressed={favorite.selected}
            title={favoriteLabel}
            onClick={favorite.onToggle}
          >
            <svg
              className="item-identity__star"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z" />
            </svg>
          </IconButton>
        ) : null}
        {children}
      </Container>
    </Container>
  )
}
