import './ItemIcon.css'

interface ItemIconProps {
  iconUrl: string
  itemName: string
}

const placeholderUrl = `${import.meta.env.BASE_URL}item-placeholder.svg`

export function ItemIcon({ iconUrl, itemName }: ItemIconProps) {
  return (
    <img
      className="item-icon"
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
