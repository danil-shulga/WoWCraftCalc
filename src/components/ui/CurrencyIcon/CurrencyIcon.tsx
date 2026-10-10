import type { CurrencyDisplayMode } from '../../../domain/user-settings'
import './CurrencyIcon.css'

export type Currency = 'gold' | 'silver' | 'copper'

const currencyLabels: Record<Currency, string> = {
  gold: 'з',
  silver: 'с',
  copper: 'м',
}

interface CurrencyIconProps {
  currency: Currency
  displayMode?: CurrencyDisplayMode
}

export function CurrencyIcon({ currency, displayMode }: CurrencyIconProps) {
  const displayClass = displayMode === undefined ? '' : `currency-mark--${displayMode}`

  return (
    <span className={`currency-mark ${displayClass}`.trim()} aria-hidden="true">
      <span className={`currency-icon currency-icon--${currency}`} />
      <span className="currency-mark__text">{currencyLabels[currency]}</span>
    </span>
  )
}
