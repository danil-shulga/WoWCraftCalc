import { Checkbox } from '../../components/ui/Checkbox/Checkbox'
import type { GameVersion } from '../../domain/game-version'
import type { TsmSettings } from '../../domain/tsm'
import './PriceModeSelector.css'

interface PriceModeSelectorProps {
  gameVersion: GameVersion
  settings: TsmSettings
  onChange: (settings: TsmSettings) => void
}

export function PriceModeSelector({
  gameVersion,
  settings,
  onChange,
}: PriceModeSelectorProps) {
  if (gameVersion !== 'tbc') return null
  return (
    <fieldset className="price-mode-selector">
      <legend>Цены для расчётов</legend>
      {(
        [
          { value: 'individual', label: 'Выбранные' },
          { value: 'tsm', label: 'По TSM' },
        ] as const
      ).map((mode) => (
        <Checkbox
          key={mode.value}
          controlType="radio"
          name="tsm-price-mode"
          label={mode.label}
          checked={settings.priceMode === mode.value}
          onChange={(checked) => {
            if (checked) onChange({ ...settings, priceMode: mode.value })
          }}
        />
      ))}
    </fieldset>
  )
}
