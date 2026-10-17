import type { Item } from '../../../domain/item.types'
import './ItemIcon.css'

interface ItemIconProps {
  iconUrl: string
  itemName: string
  qualityId?: Item['qualityId']
  size?: 'extra-small' | 'small' | 'medium' | 'large'
}

const placeholderUrl = `${import.meta.env.BASE_URL}item-placeholder.svg`

export function ItemIcon({
  iconUrl,
  itemName,
  qualityId,
  size = 'large',
}: ItemIconProps) {
  return (
    <img
      className={`item-icon item-icon--${size}`}
      data-quality={qualityId}
      src={iconUrl || placeholderUrl}
      alt=""
      title={`Иконка: ${itemName}`}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.onerror = null
        event.currentTarget.src = placeholderUrl
      }}
    />
  )
}
