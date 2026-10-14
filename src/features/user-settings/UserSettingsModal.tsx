import type { ReactNode } from 'react'
import { Button } from '../../components/ui/Button/Button'
import { Checkbox } from '../../components/ui/Checkbox/Checkbox'
import { MoneyDisplay } from '../../components/ui/MoneyDisplay/MoneyDisplay'
import { Modal } from '../../components/ui/Modal/Modal'
import type { Profession } from '../../domain/professions'
import { GAME_VERSION_REGISTRY, professionOptionsFor } from '../../domain/game-version'
import type { GameVersion } from '../../domain/game-version'
import { GameVersionPicker } from '../../components/ui/GameVersionPicker/GameVersionPicker'
import type { ItemCatalog, ItemNamesUpdate } from '../../domain/item.types'
import { ItemNamesLoader } from '../wowhead-import/ItemNamesLoader'
import type { CurrencyDisplayMode, ItemLanguage } from '../../domain/user-settings'
import './UserSettingsModal.css'
import { TsmSettingsSection } from '../tsm/TsmSettingsSection'
import type { TsmSettingsSectionProps } from '../tsm/TsmSettingsSection'

interface UserSettingsModalProps {
  dataTransfer?: ReactNode
  tsm?: TsmSettingsSectionProps
  gameVersion?: GameVersion
  workspaceRevision?: number
  onGameVersionChange?: (version: GameVersion) => void
  catalog: ItemCatalog
  onItemNamesApply: (updates: readonly ItemNamesUpdate[]) => string | null
  ownedProfessions: readonly Profession[]
  currencyDisplay: CurrencyDisplayMode
  itemLanguage: ItemLanguage
  onItemLanguageChange: (language: ItemLanguage) => void
  onProfessionChange: (profession: Profession, owned: boolean) => void
  onCurrencyDisplayChange: (mode: CurrencyDisplayMode) => void
  onClose: () => void
}

export function UserSettingsModal({
  dataTransfer,
  tsm,
  catalog,
  gameVersion = 'forever',
  workspaceRevision = 0,
  onGameVersionChange = () => {
    /* Standalone settings may omit version switching. */
  },
  onItemNamesApply,
  ownedProfessions,
  currencyDisplay,
  itemLanguage,
  onItemLanguageChange,
  onProfessionChange,
  onCurrencyDisplayChange,
  onClose,
}: UserSettingsModalProps) {
  const ownedProfessionSet = new Set(ownedProfessions)

  return (
    <Modal title="Настройки" onClose={onClose}>
      <div className="user-settings">
        <fieldset className="user-settings__section">
          <legend>Версия игры</legend>
          <p>
            {GAME_VERSION_REGISTRY[gameVersion].mode} · сборка{' '}
            {GAME_VERSION_REGISTRY[gameVersion].build}
            <br /> Каталог и профессии сохраняются отдельно для каждой версии.
          </p>
          <GameVersionPicker
            value={gameVersion}
            onChange={onGameVersionChange}
            fullWidth
          />
        </fieldset>
        <fieldset className="user-settings__section">
          <legend>Язык названий предметов</legend>
          <p>Названия предметов и реагентов. Поиск работает на обоих языках.</p>
          <div
            className="user-settings__language-options"
            role="group"
            aria-label="RU / EN"
          >
            {(['ru', 'en'] as const).map((language) => (
              <Button
                key={language}
                type="button"
                variant={itemLanguage === language ? 'primary' : 'secondary'}
                aria-pressed={itemLanguage === language}
                onClick={() => {
                  onItemLanguageChange(language)
                }}
              >
                {language.toUpperCase()}
              </Button>
            ))}
          </div>
        </fieldset>
        <ItemNamesLoader
          key={`${gameVersion}-${String(workspaceRevision)}`}
          gameVersion={gameVersion}
          catalog={catalog}
          itemLanguage={itemLanguage}
          onApply={onItemNamesApply}
        />
        <fieldset className="user-settings__section">
          <legend>Отображение валют</legend>
          <p>Выберите вид обозначений золота, серебра и меди.</p>
          <div className="user-settings__currency-options">
            <Checkbox
              className="user-settings__currency-option"
              controlType="radio"
              name="currency-display"
              label={
                <>
                  <span className="visually-hidden">Иконки: </span>
                  <MoneyDisplay value={123_456} displayMode="icons" />
                </>
              }
              checked={currencyDisplay === 'icons'}
              onChange={(checked) => {
                if (checked) {
                  onCurrencyDisplayChange('icons')
                }
              }}
            />
            <Checkbox
              className="user-settings__currency-option"
              controlType="radio"
              name="currency-display"
              label={
                <>
                  <span className="visually-hidden">Буквы: </span>
                  <MoneyDisplay value={123_456} displayMode="text" />
                </>
              }
              checked={currencyDisplay === 'text'}
              onChange={(checked) => {
                if (checked) {
                  onCurrencyDisplayChange('text')
                }
              }}
            />
          </div>
        </fieldset>

        {gameVersion === 'tbc' && tsm ? <TsmSettingsSection {...tsm} /> : null}
        <fieldset className="user-settings__professions">
          <legend>Профессии в наличии</legend>
          <p>Отметьте профессии, которыми владеют ваши персонажи.</p>
          <div className="user-settings__profession-list">
            {professionOptionsFor(gameVersion).map((profession) => (
              <Checkbox
                key={profession.value}
                label={profession.label}
                checked={ownedProfessionSet.has(profession.value)}
                onChange={(owned) => {
                  onProfessionChange(profession.value, owned)
                }}
              />
            ))}
          </div>
        </fieldset>
        {dataTransfer ? (
          <fieldset className="user-settings__section user-settings__backup">
            <legend>Резервная копия</legend>
            <p>Сохранение и восстановление всех каталогов и настроек в JSON.</p>
            {dataTransfer}
          </fieldset>
        ) : null}
      </div>
    </Modal>
  )
}
