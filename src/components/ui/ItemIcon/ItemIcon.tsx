import './ItemIcon.css'

interface ItemIconProps {
  iconUrl: string
  itemName: string
  size?: 'extra-small' | 'small' | 'medium' | 'large'
}

const placeholderUrl = `${import.meta.env.BASE_URL}item-placeholder.svg`

export function ItemIcon({ iconUrl, itemName, size = 'large' }: ItemIconProps) {
  return (
    <img
      className={`item-icon item-icon--${size}`}
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
