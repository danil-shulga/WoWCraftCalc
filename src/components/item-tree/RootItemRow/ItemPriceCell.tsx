import type { ItemPriceField } from '../../../domain/item.types'
import { InlineMoneyInput } from '../../ui/InlineMoneyInput/InlineMoneyInput'
import { MoneyDisplay } from '../../ui/MoneyDisplay/MoneyDisplay'
import './ItemPriceCell.css'

export interface QuickPriceEdit {
  field: ItemPriceField
  value: number | null
  onChange: (value: number | null) => void
}
interface ItemPriceCellProps {
  title: string
  editLabel: string
  itemName: string
  value: number | null
  isTsm: boolean
  field: ItemPriceField
  quickPriceEdit?: QuickPriceEdit | undefined
}
export function ItemPriceCell({
  title,
  editLabel,
  itemName,
  value,
  isTsm,
  field,
  quickPriceEdit,
}: ItemPriceCellProps) {
  const editing = quickPriceEdit?.field === field
  return (
    <div>
      <dt>{title}</dt>
      <dd
        className={editing ? 'item-row__price-editor' : undefined}
        title={isTsm ? 'Цена TSM' : undefined}
      >
        {editing ? (
          <>
            <InlineMoneyInput
              label={`${isTsm ? `Ручная ${editLabel.toLocaleLowerCase('ru-RU')}` : editLabel}: ${itemName}`}
              value={quickPriceEdit.value}
              onChange={quickPriceEdit.onChange}
            />
            {isTsm ? (
              <small className="item-row__used-price">
                Используется TSM: <MoneyDisplay value={value} />
              </small>
            ) : null}
          </>
        ) : (
          <MoneyDisplay value={value} />
        )}
      </dd>
    </div>
  )
}
