import { useState } from 'react'

import { Modal } from '../../components/ui/Modal/Modal'
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
import { ItemForm } from './ItemForm'
import { ItemSourceForm } from './ItemSourceForm'

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
  const [returnFocus] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )

  const close = () => {
    onClose()
    returnFocus?.focus()
  }

  return (
    <Modal title={title} onClose={close}>
      <ItemSourceForm
        gameVersion={gameVersion}
        itemLanguage={itemLanguage}
        defaultSection={defaultSection}
        catalog={catalog}
        onImport={onImport}
        onAddReferenceItem={onAddReferenceItem}
        onSuccess={onSuccess}
        onClose={close}
        renderManual={() => (
          <ItemForm
            defaultSection={defaultSection}
            onCancel={close}
            onSave={(input) => {
              onSave(input)
              close()
            }}
          />
        )}
      />
    </Modal>
  )
}
