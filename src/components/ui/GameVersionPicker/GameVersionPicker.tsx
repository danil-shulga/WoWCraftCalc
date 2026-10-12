import { GAME_VERSIONS, GAME_VERSION_REGISTRY } from '../../../domain/game-version'
import type { GameVersion } from '../../../domain/game-version'
import './GameVersionPicker.css'

interface GameVersionPickerProps {
  value: GameVersion
  onChange: (version: GameVersion) => void
}

export function GameVersionPicker({ value, onChange }: GameVersionPickerProps) {
  return (
    <div className="game-version-picker" role="group" aria-label="Версия игры">
      {GAME_VERSIONS.map((version) => (
        <button
          key={version}
          type="button"
          className={`button ${value === version ? 'button--primary' : 'button--secondary'}`}
          aria-pressed={value === version}
          onClick={() => {
            onChange(version)
          }}
        >
          {GAME_VERSION_REGISTRY[version].name}
        </button>
      ))}
    </div>
  )
}
