import type {
  RecipeImportData,
  ReferenceImportEntry,
} from '../../domain/recipe-import.types'
import { useState } from 'react'

import { Modal } from '../../components/ui/Modal/Modal'
import type { ItemCatalog, ItemSection } from '../../domain/item.types'
import type { ItemLanguage } from '../../domain/user-settings'
import type { GameVersion } from '../../domain/game-version'
import type { PriceContext } from '../../domain/tsm'
import type {
  ItemInput,
  RecipeImportResult,
  ReferenceBatchResult,
} from '../../store/useCraftStore'
import { ItemForm } from './ItemForm'
import { ItemSourceForm } from './ItemSourceForm'

interface ItemAddModalProps {
  prices?: PriceContext
  gameVersion?: GameVersion
  title: string
  itemLanguage?: ItemLanguage
  defaultSection: ItemSection
  catalog: ItemCatalog
  onSave: (input: ItemInput) => void
  onImport: (data: RecipeImportData) => RecipeImportResult
  onImportBatch: (entries: readonly ReferenceImportEntry[]) => ReferenceBatchResult
  onSuccess: (message: string) => void
  onClose: () => void
}

export function ItemAddModal({
  prices,
  title,
  gameVersion = 'forever',
  itemLanguage = 'ru',
  defaultSection,
  catalog,
  onSave,
  onImport,
  onImportBatch,
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
        onImportBatch={onImportBatch}
        onSuccess={onSuccess}
        onClose={close}
        renderManual={() => (
          <ItemForm
            prices={prices}
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
