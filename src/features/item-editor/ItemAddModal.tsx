import { useState } from 'react'

import { Modal } from '../../components/ui/Modal/Modal'
import { Tabs } from '../../components/ui/Tabs/Tabs'
import type { ItemCatalog, ItemSection } from '../../domain/item.types'
import type {
  ItemInput,
  RecipeImportData,
  RecipeImportResult,
} from '../../store/useCraftStore'
import { WowheadImportForm } from '../wowhead-import/WowheadImportForm'
import { ItemForm } from './ItemForm'

type AddMethod = 'wowhead' | 'manual'

const addMethods: readonly { value: AddMethod; label: string }[] = [
  { value: 'wowhead', label: 'Импорт из Wowhead' },
  { value: 'manual', label: 'Добавить вручную' },
]

interface ItemAddModalProps {
  title: string
  defaultSection: ItemSection
  catalog: ItemCatalog
  onSave: (input: ItemInput) => void
  onImport: (data: RecipeImportData) => RecipeImportResult
  onClose: () => void
}

export function ItemAddModal({
  title,
  defaultSection,
  catalog,
  onSave,
  onImport,
  onClose,
}: ItemAddModalProps) {
  const [method, setMethod] = useState<AddMethod>('wowhead')
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
      <div hidden={method !== 'wowhead'} inert={method !== 'wowhead'}>
        <WowheadImportForm
          catalog={catalog}
          onImport={onImport}
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
