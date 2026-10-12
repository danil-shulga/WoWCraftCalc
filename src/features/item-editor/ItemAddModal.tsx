import { useState } from 'react'

import { Modal } from '../../components/ui/Modal/Modal'
import { Tabs } from '../../components/ui/Tabs/Tabs'
import type { ItemCatalog, ItemSection } from '../../domain/item.types'
import type { ItemLanguage } from '../../domain/user-settings'
import type { GameVersion } from '../../domain/game-version'
import type {
  ItemInput,
  RecipeImportData,
  RecipeImportResult,
  RecipeImportItem,
  ReferenceItemAddResult,
} from '../../store/useCraftStore'
import { ReferenceDatabaseForm } from '../reference-database/ReferenceDatabaseForm'
import { WowheadImportForm } from '../wowhead-import/WowheadImportForm'
import { ItemForm } from './ItemForm'

type AddMethod = 'database' | 'wowhead' | 'manual'

const addMethods: readonly { value: AddMethod; label: string }[] = [
  { value: 'database', label: 'Из базы' },
  { value: 'wowhead', label: 'Импорт из Wowhead' },
  { value: 'manual', label: 'Добавить вручную' },
]

interface ItemAddModalProps {
  gameVersion?: GameVersion
  title: string
  itemLanguage?: ItemLanguage
  defaultSection: ItemSection
  catalog: ItemCatalog
  onSave: (input: ItemInput) => void
  onImport: (data: RecipeImportData) => RecipeImportResult
  onAddReferenceItem: (data: RecipeImportItem) => ReferenceItemAddResult
  onSuccess: (message: string) => void
  onClose: () => void
}

export function ItemAddModal({
  title,
  gameVersion = 'forever',
  itemLanguage = 'ru',
  defaultSection,
  catalog,
  onSave,
  onImport,
  onAddReferenceItem,
  onSuccess,
  onClose,
}: ItemAddModalProps) {
  const [method, setMethod] = useState<AddMethod>('database')
  const [hasVisitedManual, setHasVisitedManual] = useState(false)
  const [returnFocus] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )

  const close = () => {
    onClose()
    returnFocus?.focus()
  }

  return (
    <Modal title={title} onClose={close}>
      <Tabs
        tabs={addMethods}
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
          isActive={method === 'database'}
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
          isActive={method === 'wowhead'}
        />
      </div>
      {hasVisitedManual ? (
        <div hidden={method !== 'manual'} inert={method !== 'manual'}>
          <ItemForm
            defaultSection={defaultSection}
            onCancel={close}
            onSave={(input) => {
              onSave(input)
              close()
            }}
          />
        </div>
      ) : null}
    </Modal>
  )
}
