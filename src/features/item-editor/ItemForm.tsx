import { FormError } from '../../components/ui/FormError/FormError'
import { Button } from '../../components/ui/Button/Button'
import { useState, type SyntheticEvent } from 'react'

import type { Item, ItemSection } from '../../domain/item.types'
import type { PriceContext } from '../../domain/tsm'
import type { ItemInput } from '../../store/useCraftStore'
import '../EditorForm.css'
import { ItemDescriptionFields } from './ItemDescriptionFields'
import {
  useItemDescriptionDraft,
  validateItemDescription,
} from './useItemDescriptionDraft'
import './ItemForm.css'

interface ItemFormProps {
  prices?: PriceContext | undefined
  initialItem?: Item
  defaultSection: ItemSection
  onSave: (input: ItemInput) => void
  onCancel: () => void
}

export function ItemForm({
  prices,
  initialItem,
  defaultSection,
  onSave,
  onCancel,
}: ItemFormProps) {
  const { draft, setDraft } = useItemDescriptionDraft(initialItem, defaultSection)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault()
    const result = validateItemDescription(draft)
    if (!result.success) {
      setError(result.error)
      return
    }
    onSave(result.input)
  }

  return (
    <form className="editor-form" onSubmit={handleSubmit}>
      <ItemDescriptionFields
        draft={draft}
        onChange={setDraft}
        item={initialItem}
        prices={prices}
      />

      <FormError message={error} announce={false} />

      <footer className="editor-form__actions">
        <Button variant="secondary" type="button" onClick={onCancel}>
          Отмена
        </Button>
        <Button variant="primary" type="submit">
          Сохранить
        </Button>
      </footer>
    </form>
  )
}
