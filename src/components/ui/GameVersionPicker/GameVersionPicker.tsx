import { Button } from '../Button/Button'
import { GAME_VERSIONS, GAME_VERSION_REGISTRY } from '../../../domain/game-version'
import type { GameVersion } from '../../../domain/game-version'
import './GameVersionPicker.css'

interface GameVersionPickerProps {
  value: GameVersion
  onChange: (version: GameVersion) => void
  fullWidth?: boolean
}

export function GameVersionPicker({
  value,
  onChange,
  fullWidth = false,
}: GameVersionPickerProps) {
  return (
    <div
      className={
        fullWidth
          ? 'game-version-picker game-version-picker--full-width'
          : 'game-version-picker'
      }
      role="group"
      aria-label="Версия игры"
    >
      {GAME_VERSIONS.map((version) => (
        <Button
          key={version}
          type="button"
          variant={value === version ? 'primary' : 'secondary'}
          aria-pressed={value === version}
          onClick={() => {
            onChange(version)
          }}
        >
          {GAME_VERSION_REGISTRY[version].name}
        </Button>
      ))}
    </div>
  )
}
