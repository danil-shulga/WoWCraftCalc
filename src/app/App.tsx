import { useState } from 'react'

import { Sidebar, type AppTab } from '../components/navigation/Sidebar/Sidebar'
import { DataTransferControls } from '../features/data-transfer/DataTransferControls'
import { UserSettingsModal } from '../features/user-settings/UserSettingsModal'
import { ItemsPage } from '../pages/ItemsPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { useCraftStore, usePersistenceStatusStore } from '../store/useCraftStore'
import '../components/ui/Button.css'
import './App.css'

function CurrentPage({ activeTab }: { activeTab: AppTab }) {
  switch (activeTab) {
    case 'crafts':
      return <ItemsPage key="crafts" section="crafts" />
    case 'reagents':
      return <ItemsPage key="reagents" section="reagents" />
    case 'profitable':
      return <PlaceholderPage title="Выгодные" />
    case 'favorites':
      return <PlaceholderPage title="Любимые" />
  }
}

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('crafts')
  const [areSettingsOpen, setAreSettingsOpen] = useState(false)
  const items = useCraftStore((state) => state.items)
  const ownedProfessions = useCraftStore((state) => state.ownedProfessions)
  const currencyDisplay = useCraftStore((state) => state.currencyDisplay)
  const replaceData = useCraftStore((state) => state.replaceData)
  const resetData = useCraftStore((state) => state.resetData)
  const setProfessionOwned = useCraftStore((state) => state.setProfessionOwned)
  const setCurrencyDisplay = useCraftStore((state) => state.setCurrencyDisplay)
  const hydrationError = usePersistenceStatusStore((state) => state.hydrationError)
  const recoveryRequired = usePersistenceStatusStore((state) => state.recoveryRequired)

  return (
    <div className="app-shell" data-currency-display={currencyDisplay}>
      <Sidebar activeTab={activeTab} onChange={setActiveTab} />
      <main className="main-content">
        {recoveryRequired ? (
          <div className="persistence-error" role="alert">
            <strong>Не удалось загрузить сохранённые данные.</strong>
            <span>{hydrationError}</span>
            <span>
              Автоматическое сохранение приостановлено. Изменения остаются только в
              текущей вкладке; исходная запись в браузере защищена. Импортируйте резервную
              копию или подтвердите сброс данных, чтобы возобновить сохранение.
            </span>
          </div>
        ) : null}
        <div className="utility-bar">
          <button
            className="button button--secondary settings-button"
            type="button"
            onClick={() => {
              setAreSettingsOpen(true)
            }}
          >
            <span aria-hidden="true">⚙</span>
            Настройки
          </button>
          <DataTransferControls
            data={{ items, ownedProfessions, currencyDisplay }}
            onImport={replaceData}
            recoveryRequired={recoveryRequired}
            onReset={resetData}
          />
        </div>
        <CurrentPage activeTab={activeTab} />
      </main>
      {areSettingsOpen ? (
        <UserSettingsModal
          ownedProfessions={ownedProfessions}
          currencyDisplay={currencyDisplay}
          onProfessionChange={setProfessionOwned}
          onCurrencyDisplayChange={setCurrencyDisplay}
          onClose={() => {
            setAreSettingsOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
