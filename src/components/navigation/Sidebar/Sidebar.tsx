import { Button } from '../../ui/Button/Button'
import './Sidebar.css'
import { useEffect, useRef, useState } from 'react'
import { GameVersionPicker } from '../../ui/GameVersionPicker/GameVersionPicker'
import { GAME_VERSION_REGISTRY } from '../../../domain/game-version'
import type { GameVersion } from '../../../domain/game-version'
import { formatStorageUsage } from '../../../domain/storage-usage'

export type AppTab = 'reagents' | 'crafts' | 'profitable' | 'favorites'

interface SidebarProps {
  storageBytes: number | null
  gameVersion: GameVersion
  onGameVersionChange: (version: GameVersion) => void
  activeTab: AppTab
  onChange: (tab: AppTab) => void
}

const tabs: readonly { id: AppTab; label: string; available: boolean }[] = [
  { id: 'reagents', label: 'Реагенты', available: true },
  { id: 'crafts', label: 'Крафты', available: true },
  { id: 'profitable', label: 'Выгодные', available: false },
  { id: 'favorites', label: 'Избранные', available: false },
]

export function Sidebar({
  storageBytes,
  activeTab,
  onChange,
  gameVersion,
  onGameVersionChange,
}: SidebarProps) {
  const [open, setOpen] = useState(false)
  const brandRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
    const close = () => {
      setOpen(false)
      brandRef.current?.focus()
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
    }
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target) &&
        !brandRef.current?.contains(event.target)
      )
        close()
    }
    document.addEventListener('keydown', keydown)
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('pointerdown', outside)
    }
  }, [open])
  return (
    <aside className="sidebar">
      <Button
        variant="plain"
        className="brand"
        type="button"
        ref={brandRef}
        aria-label={`Выбрать версию игры: ${GAME_VERSION_REGISTRY[gameVersion].name}`}
        aria-expanded={open}
        aria-controls="sidebar-game-version"
        onClick={() => {
          setOpen(!open)
        }}
      >
        <span className="brand__mark">C</span>
        <div>
          <strong>CraftCalc</strong>
          <small>{GAME_VERSION_REGISTRY[gameVersion].name}</small>
        </div>
      </Button>
      {open ? (
        <div id="sidebar-game-version" className="brand__versions" ref={menuRef}>
          <GameVersionPicker
            value={gameVersion}
            onChange={(version) => {
              setOpen(false)
              brandRef.current?.focus()
              onGameVersionChange(version)
            }}
          />
        </div>
      ) : null}
      <nav aria-label="Разделы калькулятора">
        {tabs.map((tab) => (
          <Button
            variant="plain"
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
          </Button>
        ))}
      </nav>
      <p className="sidebar__note">
        Данные хранятся только в этом браузере.
        <span
          className="sidebar__storage"
          title="Оценка всех записей localStorage этого сайта по размеру строк UTF-16. Остаток рассчитан от типичного лимита 5 МиБ; фактическая квота зависит от браузера."
        >
          {formatStorageUsage(storageBytes)}
        </span>
      </p>
    </aside>
  )
}
