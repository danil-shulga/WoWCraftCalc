import { useState, type SyntheticEvent } from 'react'

import type { Item, ItemSection } from '../../domain/item.types'
import type { ItemInput } from '../../store/useCraftStore'
import '../../components/ui/Button.css'
import '../EditorForm.css'
import { ItemDescriptionFields } from './ItemDescriptionFields'
import {
  useItemDescriptionDraft,
  validateItemDescription,
} from './useItemDescriptionDraft'
import './ItemForm.css'

interface ItemFormProps {
  initialItem?: Item
  defaultSection: ItemSection
  onSave: (input: ItemInput) => void
  onCancel: () => void
}

export function ItemForm({
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
      <ItemDescriptionFields draft={draft} onChange={setDraft} />

      {error === null ? null : <p className="form-error">{error}</p>}

      <footer className="editor-form__actions">
        <button className="button button--secondary" type="button" onClick={onCancel}>
          Отмена
        </button>
        <button className="button button--primary" type="submit">
          Сохранить
        </button>
      </footer>
    </form>
  )
}
