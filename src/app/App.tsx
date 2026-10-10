import { useState } from 'react'

import { Sidebar, type AppTab } from '../components/navigation/Sidebar/Sidebar'
import { DataTransferControls } from '../features/data-transfer/DataTransferControls'
import { ItemsPage } from '../pages/ItemsPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { useCraftStore } from '../store/useCraftStore'
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
  const items = useCraftStore((state) => state.items)
  const replaceItems = useCraftStore((state) => state.replaceItems)

  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} onChange={setActiveTab} />
      <main className="main-content">
        <div className="utility-bar">
          <DataTransferControls items={items} onImport={replaceItems} />
        </div>
        <CurrentPage activeTab={activeTab} />
      </main>
    </div>
  )
}
