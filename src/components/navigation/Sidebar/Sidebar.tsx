import './Sidebar.css'

export type AppTab = 'reagents' | 'crafts' | 'profitable' | 'favorites'

interface SidebarProps {
  activeTab: AppTab
  onChange: (tab: AppTab) => void
}

const tabs: readonly { id: AppTab; label: string; available: boolean }[] = [
  { id: 'reagents', label: 'Реагенты', available: true },
  { id: 'crafts', label: 'Крафты', available: true },
  { id: 'profitable', label: 'Выгодные', available: false },
  { id: 'favorites', label: 'Избранные', available: false },
]

export function Sidebar({ activeTab, onChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand__mark">C</span>
        <div>
          <strong>CraftCalc</strong>
          <small>WoW Classic</small>
        </div>
      </div>
      <nav aria-label="Разделы калькулятора">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={
              activeTab === tab.id ? 'nav-button nav-button--active' : 'nav-button'
            }
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => {
              onChange(tab.id)
            }}
          >
            <span>{tab.label}</span>
            {tab.available ? null : <small>скоро</small>}
          </button>
        ))}
      </nav>
      <p className="sidebar__note">Данные хранятся только в этом браузере.</p>
    </aside>
  )
}
