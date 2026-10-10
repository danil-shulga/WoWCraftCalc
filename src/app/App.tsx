import { useState } from 'react'

import { Sidebar, type AppTab } from '../components/navigation/Sidebar/Sidebar'
import { DataTransferControls } from '../features/data-transfer/DataTransferControls'
import { UserSettingsModal } from '../features/user-settings/UserSettingsModal'
import { ItemsPage } from '../pages/ItemsPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { useCraftStore } from '../store/useCraftStore'
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
  const replaceItems = useCraftStore((state) => state.replaceItems)
  const setProfessionOwned = useCraftStore((state) => state.setProfessionOwned)
  const setCurrencyDisplay = useCraftStore((state) => state.setCurrencyDisplay)

  return (
    <div className="app-shell" data-currency-display={currencyDisplay}>
      <Sidebar activeTab={activeTab} onChange={setActiveTab} />
      <main className="main-content">
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
          <DataTransferControls items={items} onImport={replaceItems} />
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
