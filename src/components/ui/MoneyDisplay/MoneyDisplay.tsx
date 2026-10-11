import { splitCopper } from '../../../domain/money'
import type { CurrencyDisplayMode } from '../../../domain/user-settings'
import { CurrencyIcon } from '../CurrencyIcon/CurrencyIcon'
import './MoneyDisplay.css'

interface MoneyDisplayProps {
  value: number | null
  displayMode?: CurrencyDisplayMode
}

interface MoneyPartProps {
  value: number
  currency: 'gold' | 'silver' | 'copper'
  accessibleName: string
  displayMode: CurrencyDisplayMode | undefined
}

function MoneyPart({ value, currency, accessibleName, displayMode }: MoneyPartProps) {
  return (
    <span className="money-display__part">
      <span>{value}</span>
      <CurrencyIcon
        currency={currency}
        {...(displayMode === undefined ? {} : { displayMode })}
      />
      <span className="money-display__currency-name">{accessibleName}</span>
    </span>
  )
}

export function MoneyDisplay({ value, displayMode }: MoneyDisplayProps) {
  if (value === null) {
    return <span className="money-display money-display--unset">не указано</span>
  }

  const { gold, silver, copper } = splitCopper(Math.abs(value))

  return (
    <span className="money-display">
      {value < 0 ? <span>−</span> : null}
      {gold > 0 ? (
        <MoneyPart
          value={gold}
          currency="gold"
          accessibleName="золота"
          displayMode={displayMode}
        />
      ) : null}
      {silver > 0 || gold > 0 ? (
        <MoneyPart
          value={silver}
          currency="silver"
          accessibleName="серебра"
          displayMode={displayMode}
        />
      ) : null}
      <MoneyPart
        value={copper}
        currency="copper"
        accessibleName="меди"
        displayMode={displayMode}
      />
    </span>
  )
}
