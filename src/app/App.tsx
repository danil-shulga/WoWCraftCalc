import { Button } from '../components/ui/Button/Button'
import { selectActiveItems, selectActiveProfessions } from '../store/craft.selectors'
import { useEffect, useLayoutEffect, useState } from 'react'
import { checkTsmUpdate, startTsmClient, useTsmStore } from '../features/tsm/tsm-client'
import { DraftContext } from './draft-guard'
import type { GameVersion } from '../domain/game-version'
import { GAME_VERSION_REGISTRY } from '../domain/game-version'
import { ConfirmDialog } from '../components/ui/ConfirmDialog/ConfirmDialog'

import { Sidebar, type AppTab } from '../components/navigation/Sidebar/Sidebar'
import { DataTransferControls } from '../features/data-transfer/DataTransferControls'
import { UserSettingsModal } from '../features/user-settings/UserSettingsModal'
import { ItemsPage } from '../pages/ItemsPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { useCraftStore, usePersistenceStatusStore } from '../store/useCraftStore'
import { useLocalStorageUsage } from './useLocalStorageUsage'
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
  const storageBytes = useLocalStorageUsage()
  useEffect(startTsmClient, [])
  const [activeTab, setActiveTab] = useState<AppTab>('crafts')
  const [areSettingsOpen, setAreSettingsOpen] = useState(false)
  const [drafts] = useState(() => new Set<string>())
  const [pendingVersion, setPendingVersion] = useState<GameVersion | null>(null)
  const items = useCraftStore(selectActiveItems)
  const ownedProfessions = useCraftStore(selectActiveProfessions)
  const currencyDisplay = useCraftStore((state) => state.currencyDisplay)
  const itemLanguage = useCraftStore((state) => state.itemLanguage)
  const setItemLanguage = useCraftStore((state) => state.setItemLanguage)
  const fillItemNames = useCraftStore((state) => state.fillItemNames)
  const workspaces = useCraftStore((state) => state.workspaces)
  const tbcPricing = useCraftStore((state) => state.tbcPricing)
  const setTbcPricing = useCraftStore((state) => state.setTbcPricing)
  const tsmState = useTsmStore()
  const activeVersion = useCraftStore((state) => state.activeVersion)
  const workspaceRevision = useCraftStore((state) => state.workspaceRevision)
  const setActiveVersion = useCraftStore((state) => state.setActiveVersion)
  const replaceData = useCraftStore((state) => state.replaceData)
  const resetData = useCraftStore((state) => state.resetData)
  const setProfessionOwned = useCraftStore((state) => state.setProfessionOwned)
  const setCurrencyDisplay = useCraftStore((state) => state.setCurrencyDisplay)
  const hydrationError = usePersistenceStatusStore((state) => state.hydrationError)
  const recoveryRequired = usePersistenceStatusStore((state) => state.recoveryRequired)
  useLayoutEffect(() => {
    document.documentElement.dataset.gameVersion = activeVersion
  }, [activeVersion])
  const switchVersion = (version: GameVersion) => {
    if (version === activeVersion) return
    if (drafts.size > 0) setPendingVersion(version)
    else setActiveVersion(version)
  }

  return (
    <DraftContext.Provider value={drafts}>
      <div className="app-shell" data-currency-display={currencyDisplay}>
        <Sidebar
          onOpenSettings={() => {
            setAreSettingsOpen(true)
          }}
          storageBytes={storageBytes}
          activeTab={activeTab}
          onChange={setActiveTab}
          gameVersion={activeVersion}
          onGameVersionChange={switchVersion}
        />
        <main className="main-content">
          {recoveryRequired ? (
            <div className="persistence-error" role="alert">
              <strong>Не удалось загрузить сохранённые данные.</strong>
              <span>{hydrationError}</span>
              <span>
                Автоматическое сохранение приостановлено. Изменения остаются только в
                текущей вкладке; исходная запись в браузере защищена. Импортируйте
                резервную копию или подтвердите сброс данных, чтобы возобновить
                сохранение.
              </span>
            </div>
          ) : null}
          {!recoveryRequired && hydrationError ? (
            <div className="persistence-error" role="alert">
              <strong>Не удалось сохранить данные.</strong>
              <span>{hydrationError}</span>
              <span>
                Правки остаются в текущей вкладке. Сохраните резервную копию; запись будет
                повторена при следующем изменении.
              </span>
            </div>
          ) : null}
          <CurrentPage
            key={`${activeVersion}-${String(workspaceRevision)}`}
            activeTab={activeTab}
          />
        </main>
        <Button
          variant="plain"
          className="scroll-to-top"
          type="button"
          aria-label="Наверх страницы"
          title="Наверх страницы"
          onClick={() => {
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'instant'
                : 'smooth',
            })
          }}
        >
          <span aria-hidden="true">↑</span>
        </Button>
        {areSettingsOpen ? (
          <UserSettingsModal
            dataTransfer={
              <DataTransferControls
                data={{
                  activeVersion,
                  workspaces,
                  currencyDisplay,
                  itemLanguage,
                  tbcPricing,
                }}
                onImport={replaceData}
                recoveryRequired={recoveryRequired}
                onReset={resetData}
              />
            }
            tsm={{
              settings: tbcPricing,
              state: tsmState,
              onChange: setTbcPricing,
              onCheck: () => {
                void checkTsmUpdate()
              },
            }}
            gameVersion={activeVersion}
            workspaceRevision={workspaceRevision}
            onGameVersionChange={switchVersion}
            catalog={items}
            onItemNamesApply={(updates) =>
              fillItemNames(updates, {
                version: activeVersion,
                revision: workspaceRevision,
              })
            }
            ownedProfessions={ownedProfessions}
            currencyDisplay={currencyDisplay}
            itemLanguage={itemLanguage}
            onItemLanguageChange={setItemLanguage}
            onProfessionChange={setProfessionOwned}
            onCurrencyDisplayChange={setCurrencyDisplay}
            onClose={() => {
              setAreSettingsOpen(false)
            }}
          />
        ) : null}
        {pendingVersion ? (
          <ConfirmDialog
            title="Переключить версию игры?"
            message={`Есть несохранённые изменения. При переходе в ${GAME_VERSION_REGISTRY[pendingVersion].name} они будут отброшены.`}
            cancelLabel="Отменить переключение"
            confirmLabel="Переключить и отбросить изменения"
            onCancel={() => {
              setPendingVersion(null)
            }}
            onConfirm={() => {
              setActiveVersion(pendingVersion)
              setPendingVersion(null)
            }}
          />
        ) : null}
      </div>
    </DraftContext.Provider>
  )
}
