import { useState, type ReactNode } from 'react'

import { Tabs } from '../../components/ui/Tabs/Tabs'
import type { Item, ItemCatalog, ItemSection } from '../../domain/item.types'
import type { ItemLanguage } from '../../domain/user-settings'
import type { GameVersion } from '../../domain/game-version'
import type {
  RecipeImportData,
  RecipeImportResult,
  RecipeImportItem,
  ReferenceItemAddResult,
} from '../../store/useCraftStore'
import { ReferenceDatabaseForm } from '../reference-database/ReferenceDatabaseForm'
import { WowheadImportForm } from '../wowhead-import/WowheadImportForm'
type AddMethod = 'database' | 'wowhead' | 'manual'

const addMethods: readonly { value: AddMethod; label: string }[] = [
  { value: 'database', label: 'Из базы' },
  { value: 'wowhead', label: 'Импорт из Wowhead' },
  { value: 'manual', label: 'Добавить вручную' },
]

const recipeMethods: readonly { value: AddMethod; label: string }[] = [
  { value: 'database', label: 'Из базы' },
  { value: 'wowhead', label: 'Wowhead по ссылке' },
  { value: 'manual', label: 'Вручную' },
]

interface ItemSourceFormProps {
  gameVersion: GameVersion
  itemLanguage: ItemLanguage
  defaultSection: ItemSection
  catalog: ItemCatalog
  isActive?: boolean
  initialMethod?: AddMethod
  targetItem?: Item
  onImport: (data: RecipeImportData) => RecipeImportResult
  onAddReferenceItem: (data: RecipeImportItem) => ReferenceItemAddResult
  onSuccess: (message: string) => void
  onClose: () => void
  renderManual: () => ReactNode
}

export function ItemSourceForm({
  gameVersion,
  itemLanguage,
  defaultSection,
  catalog,
  isActive = true,
  initialMethod = 'database',
  targetItem,
  onImport,
  onAddReferenceItem,
  onSuccess,
  onClose: close,
  renderManual,
}: ItemSourceFormProps) {
  const [method, setMethod] = useState<AddMethod>(initialMethod)
  const [hasVisitedManual, setHasVisitedManual] = useState(initialMethod === 'manual')

  return (
    <>
      <Tabs
        tabs={targetItem === undefined ? addMethods : recipeMethods}
        value={method}
        onChange={(nextMethod) => {
          setMethod(nextMethod)
          if (nextMethod === 'manual') {
            setHasVisitedManual(true)
          }
        }}
      />
      <div hidden={method !== 'database'} inert={method !== 'database'}>
        <ReferenceDatabaseForm
          gameVersion={gameVersion}
          catalog={catalog}
          section={defaultSection}
          itemLanguage={itemLanguage}
          isActive={isActive && method === 'database'}
          {...(targetItem === undefined ? {} : { targetItem })}
          onImport={onImport}
          onAddItem={onAddReferenceItem}
          onSuccess={onSuccess}
          onClose={close}
        />
      </div>
      <div hidden={method !== 'wowhead'} inert={method !== 'wowhead'}>
        <WowheadImportForm
          gameVersion={gameVersion}
          itemLanguage={itemLanguage}
          catalog={catalog}
          onImport={onImport}
          onSuccess={onSuccess}
          onClose={close}
          isActive={isActive && method === 'wowhead'}
          {...(targetItem === undefined ? {} : { targetItem })}
        />
      </div>
      {hasVisitedManual ? (
        <div hidden={method !== 'manual'} inert={method !== 'manual'}>
          {renderManual()}
        </div>
      ) : null}
    </>
  )
}
