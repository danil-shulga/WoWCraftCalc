import type { AcquisitionMethod } from '../../../domain/item.types'
import { formatMoney } from '../../../domain/money'
import './AcquisitionMethodPicker.css'

interface AcquisitionMethodPickerProps {
  value: AcquisitionMethod
  purchasePrice: number | null
  craftPrice: number | null
  canBuy: boolean
  canCraft: boolean
  showLegend?: boolean
  onChange: (value: AcquisitionMethod) => void
}

export function AcquisitionMethodPicker({
  value,
  purchasePrice,
  craftPrice,
  canBuy,
  canCraft,
  showLegend = false,
  onChange,
}: AcquisitionMethodPickerProps) {
  return (
    <fieldset className="acquisition-method-picker">
      <legend className={showLegend ? undefined : 'visually-hidden'}>Получать</legend>
      <div className="acquisition-method-picker__options">
        <button
          type="button"
          aria-pressed={value === 'buy'}
          disabled={!canBuy}
          onClick={() => {
            onChange('buy')
          }}
        >
          <span>Купить</span>
          <small>{formatMoney(purchasePrice)}</small>
        </button>
        <button
          type="button"
          aria-pressed={value === 'craft'}
          disabled={!canCraft}
          onClick={() => {
            onChange('craft')
          }}
        >
          <span>Крафтить</span>
          <small>{formatMoney(craftPrice)}</small>
        </button>
      </div>
    </fieldset>
  )
}
