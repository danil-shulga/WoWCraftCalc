import { useId } from 'react'

import { combineMoney, splitCopper } from '../../../domain/money'
import type { MoneyParts } from '../../../domain/money'
import { NumberInput } from '../NumberInput/NumberInput'
import './MoneyInput.css'

interface MoneyInputProps {
  label: string
  value: number | null
  onChange: (value: number | null) => void
}

export function MoneyInput({ label, value, onChange }: MoneyInputProps) {
  const id = useId()
  const parts = splitCopper(value)

  const updatePart = (part: keyof MoneyParts, partValue: number) => {
    const nextValue = combineMoney({
      ...parts,
      [part]: partValue,
    })
    onChange(nextValue === 0 ? null : nextValue)
  }

  return (
    <fieldset className="money-input">
      <legend>{label}</legend>
      <div className="money-input__fields">
        <div className="money-input__field">
          <label htmlFor={`${id}-gold`}>золото</label>
          <NumberInput
            id={`${id}-gold`}
            min={0}
            step={1}
            value={parts.gold}
            onChange={(partValue) => {
              updatePart('gold', partValue)
            }}
          />
        </div>
        <div className="money-input__field">
          <label htmlFor={`${id}-silver`}>серебро</label>
          <NumberInput
            id={`${id}-silver`}
            min={0}
            max={99}
            step={1}
            value={parts.silver}
            onChange={(partValue) => {
              updatePart('silver', partValue)
            }}
          />
        </div>
        <div className="money-input__field">
          <label htmlFor={`${id}-copper`}>медь</label>
          <NumberInput
            id={`${id}-copper`}
            min={0}
            max={99}
            step={1}
            value={parts.copper}
            onChange={(partValue) => {
              updatePart('copper', partValue)
            }}
          />
        </div>
      </div>
    </fieldset>
  )
}
