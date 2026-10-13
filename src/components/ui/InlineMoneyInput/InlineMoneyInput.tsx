import { combineMoney, splitCopper } from '../../../domain/money'
import type { MoneyParts } from '../../../domain/money'
import { CurrencyIcon } from '../CurrencyIcon/CurrencyIcon'
import { NumberInput } from '../NumberInput/NumberInput'
import './InlineMoneyInput.css'

interface InlineMoneyInputProps {
  label: string
  value: number | null
  onChange: (value: number | null) => void
}

export function InlineMoneyInput({ label, value, onChange }: InlineMoneyInputProps) {
  const parts = splitCopper(value)

  const updatePart = (part: keyof MoneyParts, partValue: number) => {
    onChange(
      combineMoney({
        ...parts,
        [part]: partValue,
      }),
    )
  }

  return (
    <fieldset className="inline-money-input" aria-label={label}>
      <div className="inline-money-input__part">
        <NumberInput
          ariaLabel={`${label}, золото`}
          min={0}
          step={1}
          value={parts.gold}
          onChange={(partValue) => {
            updatePart('gold', partValue)
          }}
        />
        <CurrencyIcon currency="gold" />
      </div>
      <div className="inline-money-input__part">
        <NumberInput
          ariaLabel={`${label}, серебро`}
          min={0}
          max={99}
          step={1}
          value={parts.silver}
          onChange={(partValue) => {
            updatePart('silver', partValue)
          }}
        />
        <CurrencyIcon currency="silver" />
      </div>
      <div className="inline-money-input__part">
        <NumberInput
          ariaLabel={`${label}, медь`}
          min={0}
          max={99}
          step={1}
          value={parts.copper}
          onChange={(partValue) => {
            updatePart('copper', partValue)
          }}
        />
        <CurrencyIcon currency="copper" />
      </div>
    </fieldset>
  )
}
