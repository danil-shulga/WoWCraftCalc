import { Button } from '../Button/Button'
import type { AcquisitionMethod } from '../../../domain/item.types'
import { MoneyDisplay } from '../MoneyDisplay/MoneyDisplay'
import './AcquisitionMethodPicker.css'

interface AcquisitionMethodPickerProps {
  value: AcquisitionMethod
  purchasePrice: number | null
  craftPrice: number | null
  automaticMethod: Exclude<AcquisitionMethod, 'auto'>
  canBuy: boolean
  canCraft: boolean
  showLegend?: boolean
  onChange: (value: AcquisitionMethod) => void
}

export function AcquisitionMethodPicker({
  value,
  purchasePrice,
  craftPrice,
  automaticMethod,
  canBuy,
  canCraft,
  showLegend = false,
  onChange,
}: AcquisitionMethodPickerProps) {
  return (
    <fieldset className="acquisition-method-picker">
      <legend className={showLegend ? undefined : 'visually-hidden'}>Получать</legend>
      <div className="acquisition-method-picker__options" data-value={value}>
        <Button
          variant="plain"
          type="button"
          aria-pressed={value === 'auto'}
          onClick={() => {
            onChange('auto')
          }}
        >
          <span>Авто</span>
          <small>{automaticMethod === 'craft' ? 'Крафтить' : 'Купить'}</small>
        </Button>
        <Button
          variant="plain"
          type="button"
          aria-pressed={value === 'buy'}
          disabled={!canBuy}
          onClick={() => {
            onChange('buy')
          }}
        >
          <span>Купить</span>
          <small>
            <MoneyDisplay value={purchasePrice} />
          </small>
        </Button>
        <Button
          variant="plain"
          type="button"
          aria-pressed={value === 'craft'}
          disabled={!canCraft}
          onClick={() => {
            onChange('craft')
          }}
        >
          <span>Крафтить</span>
          <small>
            <MoneyDisplay value={craftPrice} />
          </small>
        </Button>
      </div>
    </fieldset>
  )
}
