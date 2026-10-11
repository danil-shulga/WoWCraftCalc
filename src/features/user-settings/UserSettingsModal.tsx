import { Checkbox } from '../../components/ui/Checkbox/Checkbox'
import { MoneyDisplay } from '../../components/ui/MoneyDisplay/MoneyDisplay'
import { Modal } from '../../components/ui/Modal/Modal'
import { PROFESSION_OPTIONS, type Profession } from '../../domain/professions'
import type { ItemCatalog, ItemNamesUpdate } from '../../domain/item.types'
import { ItemNamesLoader } from '../wowhead-import/ItemNamesLoader'
import type { CurrencyDisplayMode, ItemLanguage } from '../../domain/user-settings'
import '../../components/ui/Button.css'
import './UserSettingsModal.css'

interface UserSettingsModalProps {
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
  catalog,
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
          <legend>Язык названий предметов</legend>
          <p>Названия предметов и реагентов. Поиск работает на обоих языках.</p>
          <div
            className="user-settings__language-options"
            role="group"
            aria-label="RU / EN"
          >
            {(['ru', 'en'] as const).map((language) => (
              <button
                key={language}
                type="button"
                className={`button ${itemLanguage === language ? 'button--primary' : 'button--secondary'}`}
                aria-pressed={itemLanguage === language}
                onClick={() => {
                  onItemLanguageChange(language)
                }}
              >
                {language.toUpperCase()}
              </button>
            ))}
          </div>
        </fieldset>
        <ItemNamesLoader
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

        <fieldset className="user-settings__professions">
          <legend>Профессии в наличии</legend>
          <p>Отметьте профессии, которыми владеют ваши персонажи.</p>
          <div className="user-settings__profession-list">
            {PROFESSION_OPTIONS.map((profession) => (
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
        <footer className="user-settings__actions">
          <button className="button button--primary" type="button" onClick={onClose}>
            Готово
          </button>
        </footer>
      </div>
    </Modal>
  )
}
